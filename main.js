'use strict';

const utils = require('@iobroker/adapter-core');


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

class Smartstate extends utils.Adapter {

    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    constructor(options) {
        super({
            ...options,
            name: 'smartstate',
        });

        this.stateCache = {};
        this.subscriptionSmartstateLink = {};
        this.recalculationStack = new Array();

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

        // build subscriptions from the configuration
        for (const [key, smartstate] of Object.entries(this.config.smartstate))
        {
            // add state if not there
            this.log.debug(`Create state ${key}: ${JSON.stringify(smartstate)}`);

            // build the tree for the state if necessary
            if(smartstate.path){
                const pathArray = smartstate.path.split('.');
                for (let pathIdx = 0; pathIdx < pathArray.length; pathIdx++){
                    await this.createObjectNotExists(pathArray[pathIdx], pathArray[pathIdx], 'channel');
                }
            }

            for (let childIdx = 0; childIdx < smartstate.childs.length; childIdx++)
            {
                const childObject = smartstate.childs[childIdx];
                this.addChildSubscriptionToForeignState(key, childObject);
            }

            // create (re)calculate the given smartstate value and set it
            // the method will create the state if it's not already there
            await this.recalculateSmartState(key);

            // store full object/stateIds for the created states for cleanup process
            smartStatesCreatedOrUpdated.push(this.namespace + '.' + (smartstate.path ? smartstate.path + '.' : '') + smartstate.id);
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


    addChildSubscriptionToForeignState(_smartstateId, _childObject)
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
            this.subscriptionSmartstateLink[_childObject.idOrPattern].childObject = _childObject;
        }

        // get all state id's which are within the selector if the smartstate child is of type 'selector'
        // otherwise we do have an state key which we csan insert directly
        if(_childObject.type == STATECHILDTYPE.STATE)
        {
            this.subscriptionSmartstateLink[_childObject.idOrPattern].links.push(_smartstateId);
        }
        else
        {
            try
            {
                const states = this.getStates(idOrPattern);
                this.log.error(JSON.stringify(states));
                if(states)
                {
                    for(let idx=0; idx<states.length; idx++)
                    {
                        // TODO: @@@
                        this.log.error(JSON.stringify(states[idx]));
                    }
                }
            }
            catch(_error)
            {
                this.log.error(`Error adding subscription pattern: ${_error.toString()}`);
            }
        }

        this.log.debug(`Added subscription to ${idOrPattern}`);
    }


    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     * @param {() => void} callback
     */
    onUnload(callback) {
        try {
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
        this.setTimeout(this.calculateStatesInStack.bind(this), 50);
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
            let stateDatatype;

            // initialize the smart value fromn its csalculation type
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
            for(let childIdx=0; childIdx<smartState.childs.length; childIdx++)
            {
                const stateIds = new Array();
                const childObject = smartState.childs[childIdx];

                // if the child type is a pattern, we have to get all the states for this pattern to do the
                // calculation for. Of course if a user goes crazy and uses a pattern where many states are
                // selected this wont be the best thing for performance.
                if(childObject.type == STATECHILDTYPE.PATTERN)
                {
                    const patternLinks = this.subscriptionSmartstateLink[childObject.idOrPattern].links;
                    for(let patternLinksIdx=0; patternLinksIdx<patternLinks.length; patternLinksIdx++)
                    {
                        stateIds.push(patternLinks[patternLinksIdx]);
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

                    // for each calculation type we have to do another calculation using the child values
                    // see the different cases for further info. Its really a very easy approach but it will be sufficient for many cases
                    switch(smartState.calctype)
                    {
                        case STATECALCTYPE.COUNT:
                            smartValue += value ? 1 : 0;
                            break;

                        case STATECALCTYPE.SUM:
                        case STATECALCTYPE.AVG:
                            smartValue += value;
                            break;

                        case STATECALCTYPE.OR:
                            smartValue = smartValue || (value ? true : false);
                            break;

                        case STATECALCTYPE.AND:
                            smartValue = smartValue && (value ? true : false);
                            break;

                        case STATECALCTYPE.EQUALS:
                            if(value != firstValue)
                                smartValue = false;
                            break;

                        case STATECALCTYPE.MIN:
                            if(value < curMinValue)
                            {
                                curMinValue = value;
                                smartValue = curMinValue;
                            }
                            break;

                        case STATECALCTYPE.MAX:
                            if(value > curMaxValue)
                            {
                                curMaxValue = value;
                                smartValue = curMaxValue;
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
            const evalFunction = new Function ('params', functionString);
            value = evalFunction(_params);
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