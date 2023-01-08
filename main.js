'use strict';

const utils = require('@iobroker/adapter-core');

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

        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        // this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady()
    {

        // temporary configuration for testing
        this.config.smartstate = {};
        this.config.smartstate['kitchen_light_on_counter']  = { name: 'Küchenlicht an Zähler', id: 'kitchen_light_on_counter', type: 'count', path: 'lights'};
        this.config.smartstate['kitchen_light_on_counter'].childs = new Array();
        this.config.smartstate['kitchen_light_on_counter'].childs.push( { type: 'state', id: 'artnetdmx.0.lights.Kueche_Haupt.values.isOn', function: '' } );
        this.config.smartstate['kitchen_light_on_counter'].childs.push( { type: 'state', id: 'artnetdmx.0.lights.Kueche_Indirekt.values.isOn', function: '' } );
        this.config.smartstate['kitchen_light_on_counter'].childs.push( { type: 'state', id: 'artnetdmx.0.lights.Kueche_Insel.values.isOn', function: '' } );
        this.config.smartstate['kitchen_light_on_counter'].childs.push( { type: 'state', id: 'artnetdmx.0.lights.Kueche_Fotowand.values.isOn', function: '' } );
        this.config.smartstate['kitchen_light_on_counter'].childs.push( { type: 'state', id: 'openknx.0.Schaltaktor_Dimmaktor.Schalten.Schaltaktor_|_Spots_|_Küche_Abwasch_|_Schalten', function: '' } );




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

            // create the state object. the value will be calculated and set later or if any child subscription changes
            await this.createObjectNotExists(this.getSmartstateIdWithPath(smartstate), key, 'state');
            //await this.setStateAsync(key, { val: this.convertValue(_stateValue, _stateType), ack: true });

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
            this.recalculateSmartState(key);
        }
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
            if (state /*&& state.ack*/)
            {
                this.log.warn(`State ${id} changed to ${state.val}  ACK=${state.ack}`);

                // (re)calculate all the given smartstate values which are linked to this state
                if(this.subscriptionSmartstateLink[state] && this.subscriptionSmartstateLink[state].links)
                {
                    for (let linkIdx=0; linkIdx<this.subscriptionSmartstateLink[state].links.length; linkIdx++)
                    {
                        this.recalculateSmartState(this.subscriptionSmartstateLink[state].links[linkIdx]);
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


    async recalculateSmartState(_smartStateId)
    {
        this.log.info(`Recalculating smartstate with id ${_smartStateId}`);

        const smartState = this.config.smartstate[_smartStateId];
        if(!smartState)
        {
            this.log.error(`Smartstate with id ${_smartStateId} not found!`);
            return;
        }

        // TODO: @@@


        //await this.setStateAsync(this.getSmartstateIdWithPath(smartState), { val: this.convertValue(_stateValue, _stateType), ack: true });
        await this.setStateAsync(this.getSmartstateIdWithPath(smartState), { val: null, ack: true });
    }

    // If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
    // /**
    //  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
    //  * Using this method requires "common.messagebox" property to be set to true in io-package.json
    //  * @param {ioBroker.Message} obj
    //  */
    // onMessage(obj) {
    //     if (typeof obj === 'object' && obj.message) {
    //         if (obj.command === 'send') {
    //             // e.g. send email or pushover or whatever
    //             this.log.info('send command');

    //             // Send response in callback if required
    //             if (obj.callback) this.sendTo(obj.from, obj.command, 'Message received', obj.callback);
    //         }
    //     }
    // }

}

if (require.main !== module) {
    module.exports = (options) => new Smartstate(options);
} else {
    new Smartstate();
}