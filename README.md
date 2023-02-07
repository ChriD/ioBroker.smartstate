![Logo](admin/smartstate.png)
# ioBroker.smartstate

[![NPM version](https://img.shields.io/npm/v/iobroker.smartstate.svg)](https://www.npmjs.com/package/iobroker.smartstate)
[![Downloads](https://img.shields.io/npm/dm/iobroker.smartstate.svg)](https://www.npmjs.com/package/iobroker.smartstate)
![Number of Installations](https://iobroker.live/badges/smartstate-installed.svg)
![Current version in stable repository](https://iobroker.live/badges/smartstate-stable.svg)

[![NPM](https://nodei.co/npm/iobroker.smartstate.png?downloads=true)](https://nodei.co/npm/iobroker.smartstate/)

**Tests:** ![Test and Release](https://github.com/ChriD/ioBroker.smartstate/workflows/Test%20and%20Release/badge.svg)

## smartstate adapter for ioBroker

With this adapter you can create states which are calculated by other states<br>
A good example is when you want to create a state that counts the lights that are on (see examples)<br>
The handling is very easy. Add a new smart state, define it's name and type and add child states which will be used to calculate the states value by the given type (operator)


## Getting started

Add a new smartstate by using the left `+` icon on the top left of the settings page.<br>
Then you can add following parameters.

* Smartstate settings
    | Field | Description |
    |-------------|-------------|
    | `Name` | The name of the smartstate |
    | `Id` | The id of the smartstate |
    | `Type` | Calculation type which defines how the smartstate uses the child to calculate its value |
    | `Path` | The folder/path where the state should be
    | `Calc only for ACK values` | If checked, only state values which are acknowledged will trigger a recalulation |
* Child Settings
    | Field | Description |
    |-------------|-------------|
    | `Type` | the `state` type will allow a selection of one state<br>the `pattern` type will allow a state selection pattern |
    | `Id/Pattern` | the state id or the pattern |
    | `Value function` | a valid javacsript code to change the value for the state before the operator/calculation type is applied eg: `return !value`<br>The `value` var holds the state value |

## Important  

* A smartstate can use another smartstate as child state, but please be sure you do not create a recursion (`State A` has `State B` as child and `State B` has `State A` as child).
Those recursions are not caught by the validation and will lead to endless loops and therfore will break the adapter or even the whole system 
* The adapter converts pattern subscription to state subscriptions, so states created in other adapters (after the smartstate adapter was started) which matches a pattern in a state child will not apply to the pattern selection. In this cas a restart of the smartstate adapter is necessary.
* Using the state selector dialog in the child table may take a while when first opening. I am open for contributions to open a better, newer dialog

## Example  

Here is an example of a state that counts the lights that are on(in this case kitchen) and another one which indicates if a light in the kitchen is on.
![image](https://user-images.githubusercontent.com/2505067/214155576-2b271ef3-52f7-4102-997c-f196e87ccafc.png)

In the second screenshot you can see that we are using the first smartstate for generating a boolean state which will indicate if a light is on. That can be done by using the `or` operator
![image](https://user-images.githubusercontent.com/2505067/214155618-2c963898-1efd-46f1-becf-6818543240f1.png)

This one shows the use of a pattern to determine if any dmx light is on
![image](https://user-images.githubusercontent.com/2505067/214383174-d4d23091-d2fb-4a86-a294-998a0af54dc9.png)

And here we use a function to count all lights (in this case kitchen) which are off
![image](https://user-images.githubusercontent.com/2505067/215353732-b209acb6-13d1-4e92-8158-9d4e8692d5bd.png)

Those smart states settings will create following states in the object tree
![image](https://user-images.githubusercontent.com/2505067/214383091-577a1dc9-10a5-4478-af3f-a8374a5a8487.png)

## Using the "State Info Type"
A smartstate has the ability to create an extra object/state which will include the id's of the "used states" by the smartstate<br>
The behaviour how this works differs from calulation type to calcualtion type
* For `count` `or` and `and` the states which resolve as `true` will be filled
* For `sum` and `avg` all the states will be filled
* For `min` the state with the minimal value will be filled
* For `max` the state with the maximal value will be filled
* For `equals` all states which are euqal to the "first state value" in the child list will be filled

The 'State Info Type' will set if, and how the values are beeing presented
* `No info` will not create the state info object
* `JSON array` will create a json array of the "used states"
* `JSON object` will create a json object of the "used states" where the properties reflect the state id's
* `String` will create a string which is semicollon seperated

The value which is beeing stored is delivered by the `State info type function` and will be defaulted to the full id of the state, but the user can change this by changing this function. The function has to be a valid javascript code!<br>
The variable `params` can be used and it has following properties

| Field | Description |
|-------------|-------------|
| `id` | The name of the smartstate |
| `stateObject` | The object of the state |
| `stateObjectInfo` | This is the object of the parent `device` for the state (if there is a device), otherwise its the same as `stateObject` |
  
The objects (`stateObject`, `stateObjectInfo`) are those you can see in the iobroker object list, e.g.:
![image](https://user-images.githubusercontent.com/2505067/217324484-feffe2b6-06f2-47c7-a06a-42b738bb48d5.png)

So for having the name inserted instead the id you can change te default function string to:
![image](https://user-images.githubusercontent.com/2505067/217325001-2633f893-6a96-492d-b081-394b3cd5d55a.png)


## Changelog
<!--
    Placeholder for the next version (at the beginning of the line):
    ### **WORK IN PROGRESS**
-->
### **WORK IN PROGRESS**

-   (ChriD) #3 - added option to create a datapoint/state which will show some combined state information values from the states which are used by the smart state
-   (ChriD) #1 - fixed multilayer path creation

### 0.0.2 (2023-01-29)

-   (ChriD) added ability to define a 'value function' which can be used to change the value for the state before the operator is applied

### 0.0.1 (2023-01-24)

-   (ChriD) initial version

## License
MIT License

Copyright (c) 2023 ChriD <chris_d85@hotmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
