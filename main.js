'use strict';

const utils = require('@iobroker/adapter-core');

// following constants have to be exactly the same as in the index_m.html file for the admin settings
// in future i am trying to create an extra files for constants which are used by node and the web, but
// for now we keep it redundant
const STATECALCTYPE = {
    COUNT: 'count',
    SUM: 'sum',
    OR: 'or',
    AND: 'and',
    AVG: 'avg',
    MIN: 'min',
    MAX: 'max',
    EQUALS: 'equals'
};

const STATECHILDTYPE = {
    STATE: 'STATE',
    PATTERN: 'PATTERN'
};

const STATEINFOTYPE = {
    NONE : 'No info',
    JSONARRAY: 'JSON array',
    JSONOBJECT: 'JSON object',
    STRING: 'String'
};

class Smartstate extends utils.Adapter {

    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    constructor(options) {
        super({
            ...options,
            name: 'smartstate',
        });

        // a simple state cache object which will be filled/set when a subscription will call the 'onChanged' event
        // this is here so we do not need to read every value with 'getStateAsync' because there is no need to if we
        // already subscribed to it
        this.stateCache = {};

        // this object will hold id's for a pattern state. It will be filled on adapter startup when the adapter 
        // subscribes to all states he need for calculation. It's here for fast access the ids within a pattern
        this.patternStates = {};

        // a helper object so we can easily check which smartstates we have to recalulate when a subscribed state
        // has beeing changed. It will be filled on startup of the adapter when subscribing to states
        this.subscriptionSmartstateLink = {};

        // a stack which will be processed in intervals to recalculate smartstates which do have a child state
        // which was beeing changed. Due state changes may occur very fast and maybe would interfere calculating
        // a smartstate, we have a stack which will be processed synchronous
        this.recalculationStack = new Array();

        // will be used to clear any pending timout when closing the adapter
        this.stackProcessingTimeoutId = 0;

        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }


    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady()
    {
        const smartStatesCreatedOrUpdated = new Array();

        if(this.config && this.config.smartstate)
        {
            // build subscriptions from the configuration
            for (const [key, smartstate] of Object.entries(this.config.smartstate))
            {
                const fullStateObjectId = this.namespace + '.' + (smartstate.path ? smartstate.path + '.' : '') + smartstate.id;

                // add state if not there
                this.log.debug(`Create state ${key}: ${JSON.stringify(smartstate)}`);

                // build the tree for the state if necessary
                if(smartstate.path)
                {
                    let prefix = '';
                    const pathArray = smartstate.path.split('.');
                    for (let pathIdx = 0; pathIdx < pathArray.length; pathIdx++)
                    {
                        await this.createObjectNotExists(prefix + pathArray[pathIdx], pathArray[pathIdx], 'channel');
                        prefix = pathArray[pathIdx] + '.';
                    }
                }

                for (let childIdx = 0; childIdx < smartstate.childs.length; childIdx++)
                {
                    const childObject = smartstate.childs[childIdx];
                    await this.addChildSubscriptionToForeignState(key, childObject);
                }

                // create (re)calculate the given smartstate value and set it
                // the method will create the state if it's not already there
                await this.recalculateSmartState(key);

                // store full object/stateIds for the created states for cleanup process. If we do have the state info
                // datapoint activated we have to add this object id too
                smartStatesCreatedOrUpdated.push(fullStateObjectId);
                if(smartstate.stateInfoType != STATEINFOTYPE.NONE)
                    smartStatesCreatedOrUpdated.push(this.getStateInfoObjectId(fullStateObjectId));
            }

            // remove smart states which are not mentioned in the configuration
            const states = await this.getStatesOfAsync();
            this.log.debug(`Created smart states: ${JSON.stringify(smartStatesCreatedOrUpdated)}`);
            for (const state of states)
            {
                // check if the state is defined in the configuration. The smartstate id has to be unique within the
                // smartstate adapter instance
                if(smartStatesCreatedOrUpdated.includes(state._id) == false)
                {
                    this.log.debug(`Deleting smart state with id ${state._id}`);
                    await this.delStateAsync(state._id);
                    await this.delObjectAsync(state._id, {recursive: true});
                }
            }

            this.calculateStatesInStack();
        }
    }

    /**
     * Is beeing used to generate the id for the state info datapoint. It will use the smartstateId and add some
     * fixed ending. There is currently no need for any dynamic approach to this id
     */
    getStateInfoObjectId(_smartstateId)
    {
        return `${_smartstateId}_StateInfo`;
    }


    async addChildSubscriptionToForeignState(_smartstateId, _childObject)
    {
        this.log.debug(`Adding subscription to ${JSON.stringify(_childObject)}`);

        // empty id's or pattern will not be used
        if(!_childObject.idOrPattern)
            return;

        this.subscribeForeignStates(_childObject.idOrPattern);

        // create a lookup table/object for fast lookup of smartstates for a given subscription change
        if(!this.subscriptionSmartstateLink[_childObject.idOrPattern])
        {
            this.subscriptionSmartstateLink[_childObject.idOrPattern] = {};
            this.subscriptionSmartstateLink[_childObject.idOrPattern].links = new Array();
        }

        // get all state id's which are within the selector if the smartstate child is of type 'selector'
        // otherwise we do have an state key which we csan insert directly
        if(_childObject.type == STATECHILDTYPE.STATE)
        {
            this.subscriptionSmartstateLink[_childObject.idOrPattern].links.push(_smartstateId);
        }
        else
        {
            if(!this.patternStates[_childObject.idOrPattern])
                this.patternStates[_childObject.idOrPattern] = new Array();

            try
            {
                const states = await this.getForeignStatesAsync(_childObject.idOrPattern);
                if(states)
                {
                    for (const [key, value] of Object.entries(states))
                    {
                        if(!this.subscriptionSmartstateLink[key])
                        {
                            this.subscriptionSmartstateLink[key] = {};
                            this.subscriptionSmartstateLink[key].links = new Array();
                        }
                        this.subscriptionSmartstateLink[key].links.push(_smartstateId);
                        this.patternStates[_childObject.idOrPattern].push(key);
                    }
                }
            }
            catch(_error)
            {
                this.log.error(`Error getting states for subscription pattern: ${_error.toString()}`);
            }
        }

        this.log.debug(`Added subscription to ${_childObject.idOrPattern}`);
    }


    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     * @param {() => void} callback
     */
    onUnload(callback) {
        try {
            if(this.stackProcessingTimeoutId)
                this.clearTimeout(this.stackProcessingTimeoutId);
            // we have nothing to do when unloading the adapter
            callback();
        } catch (e) {
            callback();
        }
    }


    /**
     * Is called if a subscribed state changes
     * @param {string} id
     * @param {ioBroker.State | null | undefined} state
     */
    onStateChange(id, state)
    {
        try
        {
            if (state)
            {
                this.log.debug(`State ${id} changed to ${state.val}  ACK=${state.ack}`);

                // (re)calculate all the given smartstate values which are linked to this state
                if(this.subscriptionSmartstateLink[id] && this.subscriptionSmartstateLink[id].links)
                {
                    for (let linkIdx=0; linkIdx<this.subscriptionSmartstateLink[id].links.length; linkIdx++)
                    {
                        // we have to check if we have to check the ACK of the state change value
                        const smartState = this.config.smartstate[this.subscriptionSmartstateLink[id].links[linkIdx]];
                        if(!smartState.calcOnlyForACK || state.ack == true)
                        {
                            // update the state cache with the changed state object
                            this.stateCache[id] = state;
                            // only add the ids for calculation into a stack buffer, this stack buffer will
                            // be processed and deleted by a timer method
                            this.recalculationStack.push(this.subscriptionSmartstateLink[id].links[linkIdx]);
                        }
                    }
                }
                else
                {
                    this.log.warn(`State ${id} was subscribed but is not referenced in any smart state`);
                }
            }
        }
        catch(_exception)
        {
            this.log.error(_exception.message);
        }
    }


    async calculateStatesInStack()
    {
        while (this.recalculationStack.length > 0) {
            const smartStateId = this.recalculationStack.shift();
            await this.recalculateSmartState(smartStateId);
        }
        this.stackProcessingTimeoutId = this.setTimeout(this.calculateStatesInStack.bind(this), 50);
    }


    getSmartstateIdWithPath(_smartstateObject)
    {
        return _smartstateObject.path ? (_smartstateObject.path + '.' + _smartstateObject.id) : _smartstateObject.id;
    }


    async createObjectNotExists(_id, _name, _type, _common = null)
    {
        const commonObject = _common ? _common : {};
        commonObject.name = _name;

        const objectContainer = {
            type: _type,
            common: commonObject,
            native: {},
        };
        await this.setObjectNotExistsAsync(_id, objectContainer);
    }

    async createOrUpdateState(_id, _name, _stateType, _stateRole, _stateValue)
    {
        this.log.debug(`Create state: id=${_id}, name=${_name}, type=${_stateType}, role=${_stateRole}, value=${_stateValue}`);
        const commonObject = {
            type: _stateType,
            role: _stateRole ? _stateRole : 'state',
            read: true,
            write: true
        };
        await this.createObjectNotExists(_id, _name, 'state', commonObject);
        await this.setStateAsync(_id, { val: _stateValue, ack: true });
    }

    /**
     * Is beeing called whenever a smartstate has to be recaclulated (because a child state changed)
     * it will create the smartstate object within the given path and the state info datapoint if activated
     * @param {string} _smartStateId
     */
    async recalculateSmartState(_smartStateId)
    {
        this.log.debug(`Recalculating smartstate with id ${_smartStateId}`);

        const smartState = this.config.smartstate[_smartStateId];
        if(!smartState)
        {
            this.log.error(`SmartState with id ${_smartStateId} not found!`);
            return;
        }

        try
        {
            let smartValue;
            let curMinValue, curMaxValue, firstValue;
            let stateInfoValue;
            let stateInfoStates = new Array();
            let stateDatatype;

            // initialize the smart value from it's csalculation type
            switch(smartState.calctype)
            {
                case STATECALCTYPE.COUNT:
                case STATECALCTYPE.SUM:
                case STATECALCTYPE.AVG:
                case STATECALCTYPE.MIN:
                case STATECALCTYPE.MAX:
                    smartValue = 0;
                    stateDatatype = 'number';
                    break;
                case STATECALCTYPE.AND:
                case STATECALCTYPE.EQUALS:
                    smartValue = true;
                    stateDatatype = 'boolean';
                    break;
                case STATECALCTYPE.OR:
                    smartValue = false;
                    stateDatatype = 'boolean';
                    break;
            }

            // run through the childs and calculate the overall value of the smart state
            // ATTENTION: We have built it that way to be a little more versatile when we may add some
            // features to the adapter (like executing functions for every state value which is already
            // prepared but not tested).
            for(let childIdx=0; childIdx<smartState.childs.length; childIdx++)
            {
                const stateIds = new Array();
                const childObject = smartState.childs[childIdx];

                // if the child type is a pattern, we have to get all the states for this pattern to do the
                // calculation for. Of course if a user goes crazy and uses a pattern where many states are
                // selected this won't be the best thing for performance.
                if(childObject.type == STATECHILDTYPE.PATTERN)
                {
                    const patternStates = this.patternStates[childObject.idOrPattern];
                    for(let patternStatesIdx=0; patternStatesIdx<patternStates.length; patternStatesIdx++)
                    {
                        stateIds.push(patternStates[patternStatesIdx]);
                    }
                }
                else
                {
                    stateIds.push(childObject.idOrPattern);
                }

                // after expanding the pattern's to id's we have all id's in the stateIds object and can run
                // through this object to get all states for calculation. In future we may cache the states so
                // we do not need to call 'getForeignStateAsync' and keep the load smaller 
                for(let stateIdx=0; stateIdx<stateIds.length; stateIdx++)
                {
                    // the state should be 'cached' by the state change event. In some cases we may not have the
                    // state in the cache because it hasnt changed since the start of the adapter, those states
                    // will be requested by an extra call to the state backend
                    let state = this.stateCache[stateIds[stateIdx]];
                    if(!state)
                    {
                        this.log.debug(`State ${stateIds[stateIdx]} not found in cache, i am requesting now`);
                        state = await this.getForeignStateAsync(stateIds[stateIdx]);
                        this.stateCache[stateIds[stateIdx]] = state;
                    }

                    this.log.debug(`Calculation-Child: ${childObject.idOrPattern}, state: ${stateIds[stateIdx]}, value: ${state.val}`);

                    let value;
                    if(childObject.function)
                        value = this.evaluateFunction(childObject.function, { state: state, value: state.val, childCount: smartState.childs.length });
                    else
                        value = state.val;

                    // store the first value for further calculations
                    firstValue = childIdx === 0 ? value : firstValue;

                    // we do need the id of the state within the state object itself for further processing
                    // this is only temporary and will be used for special purposes 
                    state.id = stateIds[stateIdx];

                    // for each calculation type we have to do another calculation using the child values
                    // see the different cases for further info. Its really a very easy approach but it will be sufficient for many cases
                    switch(smartState.calctype)
                    {
                        case STATECALCTYPE.COUNT:
                            smartValue += value ? 1 : 0;
                            if(value)
                                stateInfoStates.push(state);
                            break;
                        case STATECALCTYPE.SUM:
                        case STATECALCTYPE.AVG:
                            smartValue += value;
                            stateInfoStates.push(state);
                            break;
                        case STATECALCTYPE.OR:
                            smartValue = smartValue || (value ? true : false);
                            if(value)
                                stateInfoStates.push(state);
                            break;
                        case STATECALCTYPE.AND:
                            smartValue = smartValue && (value ? true : false);
                            if(value)
                                stateInfoStates.push(state);
                            break;
                        case STATECALCTYPE.EQUALS:
                            if(value != firstValue)
                                smartValue = false;
                            else
                                stateInfoStates.push(state);
                            break;
                        case STATECALCTYPE.MIN:
                            if(value < curMinValue)
                            {
                                curMinValue = value;
                                smartValue = curMinValue;
                                stateInfoStates[0] = state;
                            }
                            break;
                        case STATECALCTYPE.MAX:
                            if(value > curMaxValue)
                            {
                                curMaxValue = value;
                                smartValue = curMaxValue;
                                stateInfoStates[0] = state;
                            }
                            break;
                        default:
                            this.log.error(`Wrong or not implemented calculation type: ${smartState.calctype}`);
                    }
                }
            }

            // if we have set the state type to average value, we have to divide the sum of the values (which is the smartValue on AVG type)
            // with the count of the childs.
            if(smartState.calctype == STATECALCTYPE.AVG && smartState.childs.length)
                smartValue = smartValue / smartState.childs.length;

            // at the end a user function may change the overall smartValue
            if(smartState.function)
                smartValue = this.evaluateFunction(smartState.function, { value: smartValue, childCount: smartState.childs.length });

            this.log.debug(`New value was created for smartstate ${_smartStateId}: ${smartValue}`);

            await this.createOrUpdateState(this.getSmartstateIdWithPath(smartState), _smartStateId, stateDatatype, 'state', smartValue);


            // Following code does create the state info value if activated. This may decrease the performance of this adapter
            // There were no excessive performance tests made and i can not guess if it will have huge impact or not
            if(smartState.stateInfoType != STATEINFOTYPE.NONE)
            {
                let stateInfoObjectDatatype;

                // we have to init some variables by the stateInfoType. Those are the datapoint type for the sateInfo datapoint
                // and the info value itself which will be converted to a string or JSON output
                switch(smartState.stateInfoType)
                {
                    case STATEINFOTYPE.JSONARRAY:
                        stateInfoObjectDatatype = 'json';
                        stateInfoValue = new Array();
                        break;
                    case STATEINFOTYPE.JSONOBJECT:
                        stateInfoObjectDatatype = 'json';
                        stateInfoValue = new Object();
                        break;
                    default:
                        stateInfoObjectDatatype = 'string';
                        stateInfoValue = '';
                }

                for (let idx=0; idx<stateInfoStates.length; idx++)
                {
                    // get the object data for the state so we cann pass it to the user function
                    // furthermore we "traverse" the object tree and try to find the parent device for the state
                    // because this is the object most users want to have
                    const stateObjectInfo = await this.getForeignObjectAsync(stateInfoStates[idx].id);

                    // traverse backwards to device node, when found we read the object for the device node and
                    // this will be our object which will have the most informational meaning. If we did not find
                    // such and 'device' object, its okay, then the info object will be the state object itself
                    let deviceObjectInfo;
                    let deviceProbeId = stateInfoStates[idx].id;
                    do
                    {
                        deviceProbeId = deviceProbeId.substr(0, deviceProbeId.lastIndexOf('.'));
                        deviceObjectInfo = await this.getForeignObjectAsync(deviceProbeId);
                        if(deviceObjectInfo && deviceObjectInfo.type == 'device')
                            break;
                    }
                    while(deviceObjectInfo);

                    if(!deviceObjectInfo)
                        this.log.debug(`No 'device' parent found for ${stateInfoStates[idx].id}. Using state object for info`);

                    // the state info has the ability to build its value from a function which the user can define
                    // for this function we are creating the parameters here.
                    const functionParams = { id : stateInfoStates[idx].id, state : stateInfoStates[idx], stateObject: stateObjectInfo, deviceObject: deviceObjectInfo};

                    switch(smartState.stateInfoType)
                    {
                        case STATEINFOTYPE.JSONARRAY:
                            stateInfoValue[idx] = this.evaluateFunction(smartState.stateInfoFunction, functionParams);
                            break;
                        case STATEINFOTYPE.JSONOBJECT:
                            stateInfoValue[deviceObjectInfo ? deviceObjectInfo._id : stateInfoStates[idx].id] = this.evaluateFunction(smartState.stateInfoFunction, functionParams);
                            break;
                        default:
                            stateInfoValue += stateInfoValue ? ';' : '';
                            stateInfoValue += this.evaluateFunction(smartState.stateInfoFunction, functionParams);
                    }
                }

                const stateInfoValueConverted = smartState.stateInfoType == STATEINFOTYPE.STRING ? stateInfoValue.toString() : JSON.stringify(stateInfoValue);
                await this.createOrUpdateState(this.getStateInfoObjectId(this.getSmartstateIdWithPath(smartState)), 'State info', stateInfoObjectDatatype, 'state', stateInfoValueConverted);
            }
        }
        catch(_error)
        {
            this.log.error(`Recalculation of smartstate ${_smartStateId} failed: ${_error.toString()}`);
        }
    }


    evaluateFunction(_functionPart, _params)
    {
        let value;

        try
        {
            const functionString = `${_functionPart}`;
            const evalFunction = new Function ('value', 'params', functionString);
            value = evalFunction(_params.value, _params);
        }
        catch(_error)
        {
            this.log.error(_error.toString());
        }

        return value;
    }

}

if (require.main !== module) {
    module.exports = (options) => new Smartstate(options);
} else {
    new Smartstate();
}