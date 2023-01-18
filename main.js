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



class Smartstate extends utils.Adapter {

    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    constructor(options) {
        super({
            ...options,
            name: 'smartstate',
        });

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
        // temporary configuration for testing
        /*
        this.config.smartstate = {};
        this.config.smartstate['kitchen_light_on_counter'] = { name: 'Küchenlicht an Zähler', id: 'kitchen_light_on_counter', calctype: STATECALCTYPE.COUNT, path: 'lights', function: ''};
        this.config.smartstate['kitchen_light_on_counter'].childs = new Array();
        this.config.smartstate['kitchen_light_on_counter'].childs.push( { type: 'state', id: 'artnetdmx.0.lights.Kueche_Haupt.values.isOn', function: '' } );
        this.config.smartstate['kitchen_light_on_counter'].childs.push( { type: 'state', id: 'artnetdmx.0.lights.Kueche_Indirekt.values.isOn', function: '' } );
        this.config.smartstate['kitchen_light_on_counter'].childs.push( { type: 'state', id: 'artnetdmx.0.lights.Kueche_Insel.values.isOn', function: '' } );
        this.config.smartstate['kitchen_light_on_counter'].childs.push( { type: 'state', id: 'artnetdmx.0.lights.Kueche_Fotowand.values.isOn', function: '' } );
        this.config.smartstate['kitchen_light_on_counter'].childs.push( { type: 'state', id: 'openknx.0.Schaltaktor_Dimmaktor.Schalten.Schaltaktor_|_Spots_|_Küche_Abwasch_|_Schalten', function: '' } );

        this.config.smartstate['kitchen_light_on'] = { name: 'Küchenlicht an', id: 'kitchen_light_on', calctype: STATECALCTYPE.OR, path: 'lights', function: ''};
        this.config.smartstate['kitchen_light_on'].childs = new Array();
        this.config.smartstate['kitchen_light_on'].childs.push( { type: 'state', id: 'smartstate.0.lights.kitchen_light_on_counter', function: '' } );
        */

        // TODO: create all states with default values so subscription will work????
        this.log.error(JSON.stringify(this.config.smartstate));

        // build subscriptions from the configuration
        for (const [key, smartstate] of Object.entries(this.config.smartstate))
        {
            // add state if not there
            this.log.info(`Create state ${key}: ${JSON.stringify(smartstate)}`);

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
                this.addSubscriptionToForeignState(key, childObject.id);
            }

            // create (re)calculate the given smartstate value and set it
            await this.recalculateSmartState(key);
        }

        // TODO: remove smart states

        this.calculateStatesInStack();
    }

    addSubscriptionToForeignState(_smartstateId, _selectorOrId)
    {
        this.subscribeForeignStates(_selectorOrId);

        // create a lookup table/object for fast lookup of smartstates for a given subscription change
        if(!this.subscriptionSmartstateLink[_selectorOrId])
        {
            this.subscriptionSmartstateLink[_selectorOrId] = {};
            this.subscriptionSmartstateLink[_selectorOrId].links = new Array();
        }
        // TODO: get all state id's which are within the selector if the smartstate child is of type 'selector'
        // otherwise we do have an state key which we csan insert directly
        this.subscriptionSmartstateLink[_selectorOrId].links.push(_smartstateId);

        this.log.info(`Added subscription to ${_selectorOrId}`);
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
            if (state /*&& state.ack === true*/)
            {
                this.log.warn(`State ${id} changed to ${state.val}  ACK=${state.ack}`);

                // (re)calculate all the given smartstate values which are linked to this state
                if(this.subscriptionSmartstateLink[id] && this.subscriptionSmartstateLink[id].links)
                {
                    for (let linkIdx=0; linkIdx<this.subscriptionSmartstateLink[id].links.length; linkIdx++)
                    {
                        // only add the ids for calculation into a stack buffer, this stack bu7ffer will
                        // be processed and deleted by a timer method
                        this.recalculationStack.push(this.subscriptionSmartstateLink[id].links[linkIdx]);
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
                const childObject = smartState.childs[childIdx];
                const state = await this.getForeignStateAsync(childObject.id);

                this.log.debug(`Calculation-Child: ${childObject.id}: ${state.val}`);

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