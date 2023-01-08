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
        this.config.smartstate['kitchen_light_on_counter']  = { name: 'Küchenlicht an Zähler', id: 'kitchen_light_on_counter', type: 'count' path: 'lights'};
        this.config.smartstate['kitchen_light_on_counter'].childs = new Array();
        this.config.smartstate['kitchen_light_on_counter'].childs.push( { type: 'state', id: 'artnetdmx.0.lights.Kueche_Haupt.values.isOn', function: '' } );
        this.config.smartstate['kitchen_light_on_counter'].childs.push( { type: 'state', id: 'artnetdmx.0.lights.Kueche_Indirekt.values.isOn', function: '' } );
        this.config.smartstate['kitchen_light_on_counter'].childs.push( { type: 'state', id: 'artnetdmx.0.lights.Kueche_Insel.values.isOn', function: '' } );
        this.config.smartstate['kitchen_light_on_counter'].childs.push( { type: 'state', id: 'artnetdmx.0.lights.Kueche_Fotowand.values.isOn', function: '' } );
        this.config.smartstate['kitchen_light_on_counter'].childs.push( { type: 'state', id: 'openknx.0.Schaltaktor_Dimmaktor.Schalten.Schaltaktor_|_Spots_|_Küche_Abwasch_|_Schalten', function: '' } );
        //this.config.smartstate['kitchen_light_on_counter'].childs.push( { type: 'stateSelector', id: '???', function: '' } );

        // build subscriptions from the configuration
        for (const [key, smartstate] of Object.entries(this.config.smartstate))
        {
            this.log.info(`${key}: ${smartstate}`);
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
                this.subscriptionSmartstateLink[childObject.id].links.push(key);

                this.log.info(`Added subscription to ${childObject.id}`);
            }
        }

        //this.config.smartstate['kitchen_light_on']          = { name: 'Küchenlicht an', id: 'kitchen_light_on', type: 'or'};

        // subscript to all states given in the configuration

        //this.log.info('config option1: ' + this.config.option1);
        //this.log.info('config option2: ' + this.config.option2);

        /*
        For every state in the system there has to be also an object of type state
        Here a simple template for a boolean variable named "testVariable"
        Because every adapter instance uses its own unique namespace variable names can't collide with other adapters variables
        await this.setObjectNotExistsAsync('testVariable', {
            type: 'state',
            common: {
                name: 'testVariable',
                type: 'boolean',
                role: 'indicator',
                read: true,
                write: true,
            },
            native: {},
        });
        */

        // In order to get state updates, you need to subscribe to them. The following line adds a subscription for our variable we have created above.
        //this.subscribeStates('testVariable');
        // You can also add a subscription for multiple states. The following line watches all states starting with "lights."
        // this.subscribeStates('lights.*');
        // Or, if you really must, you can also watch all states. Don't do this if you don't need to. Otherwise this will cause a lot of unnecessary load on the system:
        // this.subscribeStates('*');

        /*
            setState examples
            you will notice that each setState will cause the stateChange event to fire (because of above subscribeStates cmd)
        */
       /*)
        // the variable testVariable is set to true as command (ack=false)
        await this.setStateAsync('testVariable', true);

        // same thing, but the value is flagged "ack"
        // ack should be always set to true if the value is received from or acknowledged from the target system
        await this.setStateAsync('testVariable', { val: true, ack: true });

        // same thing, but the state is deleted after 30s (getState will return null afterwards)
        await this.setStateAsync('testVariable', { val: true, ack: true, expire: 30 });

        // examples for the checkPassword/checkGroup functions
        let result = await this.checkPasswordAsync('admin', 'iobroker');
        this.log.info('check user admin pw iobroker: ' + result);

        result = await this.checkGroupAsync('admin', 'admin');
        this.log.info('check group user admin group admin: ' + result);
        */
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
            if (state && state.ack)
            {
                // TODO:
                this.log.warn(`State ${id} changed to ${state.val}`);
            }
            else
            {
                // The state was deleted.
                // We do nothing here for now. This shouldn't bother us anyway.
            }
        }
        catch(_exception)
        {
            this.log.error(_exception.message);
        }
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