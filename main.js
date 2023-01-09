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
        // TODO: count, sum, or, and, average, min, max
        this.config.smartstate = {};
        this.config.smartstate['kitchen_light_on_counter']  = { name: 'Küchenlicht an Zähler', id: 'kitchen_light_on_counter', calctype: STATECALCTYPE.COUNT, path: 'lights', function: ''};
        this.config.smartstate['kitchen_light_on_counter'].childs = new Array();
        this.config.smartstate['kitchen_light_on_counter'].childs.push( { type: 'state', id: 'artnetdmx.0.lights.Kueche_Haupt.values.isOn', function: '' } );
        this.config.smartstate['kitchen_light_on_counter'].childs.push( { type: 'state', id: 'artnetdmx.0.lights.Kueche_Indirekt.values.isOn', function: '' } );
        this.config.smartstate['kitchen_light_on_counter'].childs.push( { type: 'state', id: 'artnetdmx.0.lights.Kueche_Insel.values.isOn', function: '' } );
        this.config.smartstate['kitchen_light_on_counter'].childs.push( { type: 'state', id: 'artnetdmx.0.lights.Kueche_Fotowand.values.isOn', function: '' } );
        this.config.smartstate['kitchen_light_on_counter'].childs.push( { type: 'state', id: 'openknx.0.Schaltaktor_Dimmaktor.Schalten.Schaltaktor_|_Spots_|_Küche_Abwasch_|_Schalten', function: '' } );

        this.config.smartstate['kitchen_light_on']  = { name: 'Küchenlicht an', id: 'kitchen_light_on', calctype: STATECALCTYPE.OR, path: 'lights', function: ''};
        this.config.smartstate['kitchen_light_on'].childs = new Array();
        this.config.smartstate['kitchen_light_on'].childs.push( { type: 'state', id: 'smartstate.0.lights.kitchen_light_on_counter', function: '' } );


        // build subscriptions from the configuration
        for (const [key, smartstate] of Object.entries(this.config.smartstate))
        {
            // add state if not there
            this.log.info(`Erstelle status ${key}: ${JSON.stringify(smartstate)}`);

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

                this.subscribeForeignStates(childObject.id);

                // create a lookup table/object for fast lookup of smartstates for a given subscription change
                if(!this.subscriptionSmartstateLink[childObject.id])
                {
                    this.subscriptionSmartstateLink[childObject.id] = {};
                    this.subscriptionSmartstateLink[childObject.id].links = new Array();
                }
                // TODO: get all state id's which are within the selector if the smartstate child is of type 'selector'
                // otherwise we do have an state key which we csan insert directly
                this.subscriptionSmartstateLink[childObject.id].links.push(key);

                this.log.info(`Added subscription to ${childObject.id}`);
            }

            // (re)calculate the given smartstate value and set it
            await this.recalculateSmartState(key);
        }

        this.calculateStatesInStack();
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
        this.setTimeout(this.calculateStatesInStack, 50);
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
        // TODO: add try catch....

        this.log.info(`Recalculating smartstate with id ${_smartStateId}`);

        const smartState = this.config.smartstate[_smartStateId];
        if(!smartState)
        {
            this.log.error(`Smartstate with id ${_smartStateId} not found!`);
            return;
        }

        let smartValue;
        let curMinValue, curMaxValue, firstValue;

        // initialize the smart value fromn its csalculation type
        switch(smartState.calctype)
        {
            case STATECALCTYPE.COUNT:
            case STATECALCTYPE.SUM:
            case STATECALCTYPE.AVG:
            case STATECALCTYPE.MIN:
            case STATECALCTYPE.MAX:
                smartValue = 0;
                break;

            case STATECALCTYPE.AND:
            case STATECALCTYPE.OR:
            case STATECALCTYPE.EQUALS:
                smartValue = true;
                break;
        }

        // run through the childs and calculate the overall value of the smart state
        for(let childIdx=1; childIdx<smartState.childs.length; childIdx++)
        {
            const childObject = smartState.childs[childIdx];
            const state = await this.getForeignStateAsync(childObject.id);

            this.log.info(`${childObject.id} ${state.val}`);

            let value = 0;
            if(childObject.function)
            {
                // TODO: @@@
                // value = runBuf(state.val, state) ??? use object as parameter?
            }
            else
            {
                value = state.val;
            }

            // store the first value for further calculations
            firstValue = childIdx === 1 ? value : firstValue;

            // TODO: if count do counting, if summ do adding , if OR do or if and do and.....
            switch(smartState.calctype)
            {
                case STATECALCTYPE.COUNT:
                    smartValue += value ? 1 : 0;
                    break;

                case STATECALCTYPE.SUM:
                case STATECALCTYPE.AVG:
                    smartValue += value;
                    break;

                case STATECALCTYPE.AND:
                    smartValue = smartValue || value;
                    break;

                case STATECALCTYPE.OR:
                    smartValue = smartValue && value;
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
        {
            smartValue = smartValue /  smartState.childs.length;
        }


        if(smartState.function)
        {
            // TODO: @@@
            // smartValue = runBuf(value, count, countAll) ??? use object as parameter?
        }

        // TODO: if type = count the datatype will be number
        await this.createOrUpdateState(this.getSmartstateIdWithPath(smartState), _smartStateId, 'number', 'state', smartValue);
    }

}

if (require.main !== module) {
    module.exports = (options) => new Smartstate(options);
} else {
    new Smartstate();
}