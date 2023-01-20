import {LitElement, html, unsafeHTML, css, map} from './lit-all.min.js'

// TODO: key down & up

class GuiSimpleList extends LitElement {

  static styles = css`
      :host {
        display: block;
        max-width: 800px;   
      }
      
      ul {
        list-style-type: none;
        margin: 0;
        padding: 0;
        height: 100%;
      }
      ul li {
        display: flex;
        align-items: center;        
        padding-bottom: 10px;
        padding-top: 10px;        
        border-bottom:1px solid red;
      }            

      ul li .left {
        flex: 1;
        overflow: hidden;
        white-space: nowrap;
      }

      ul li .right {
        flex: 0 0 3em;
      }
      
      ul li:last-child{        
        border: 0px;
      }

      ul li.selected{
        background-color: red;        
      }

      .delete {
        flex: 1;
        
      }
    `;

  static properties = {
    listData: {state: true},
    name: {type: String, reflect: true }    
  }

  constructor() {
    super();
    this.listData = []
    this.itemTemplate;
    this.currentSelectedIdx = -1;
    this.previousSelectedIdx = -1;
  }

connectedCallback(_args)
{
    // obviously, you could also use 'setImmediate()', if available in your browser(!)
    setTimeout(() => {
      this.itemTemplate = this.innerHTML;
    }, 0);
    super.connectedCallback(_args);
}

  render() {
    return html`
    <div style="display: flex; height: 100%; flex-flow: column;">
      <div style="style="flex: 0 1 auto; margin: 0px;">
        <input id="fullname" type="text"><button @click=${() => this.addItem({ name: this._input.value}, true)}>Add</button>
        <h2>${this.name}</h2>
      </div>
      <div style="flex: 1 1 auto; overflow: auto;">        
        <ul id="list">
          ${map(this.listData, (listItem, index) => html`
            <li @click="${this.listItemClicked}" data-index="${index}">
              <div class="left">
                ${this.caclulateTemplate(listItem, this.itemTemplate)}
              </div>
              <div class="right" itemselectdisabled='true'>
                <button @click=${() => this.deleteItem(index)} itemselectdisabled='true'>x</button>
              </div>              
            </li>
          `)}
        </ul>
      </div>
    </div>
    `
  }


  caclulateTemplate(item, itemTemplate)
  {
      let value;

      try
      {
          const functionString = "html`" +  itemTemplate + "`";
          value = eval(functionString);        
      }
      catch(_error)
      {
        console.log(_error.toString());
      }

      return value;
  }


  listItemClicked(_event) {    
    
    // TODO ousource in method

    // if we hot on an element which should not trigger selection then skip
    if(_event.target.hasAttribute('itemselectdisabled'))
      return;    
    
    this.selectListItemFromElement(_event.target);
  }

  selectListItem(_index, _previousIndex = this.currentSelectedIdx)
  {    
    if(_index < 0)
    {
      this.previousSelectedIdx = _previousIndex;
      this.currentSelectedIdx = -1;
      this.unselectItems();
      this.dispatchEventSelectionChanged(-1, null);      
      return;
    }

    const element = this.shadowRoot.querySelector(`li[data-index="${_index}"]`)
    if(element)    
      this.selectListItemFromElement(element);    
  }

  getSelectedListItem()
  {
    return this.getListItem(this.currentSelectedIdx);
  }

  getListItem(_index)
  {
    if(_index < 0)
      return null;
    return this.listData[_index];
  }

  unselectItems()
  {
    Array.prototype.slice.call(this.shadowRoot.querySelectorAll('li')).forEach(function(element){
      element.classList.remove('selected');
    });  
  }

  selectListItemFromElement(_itemElement)
  {
    this.unselectItems(); 

    // find list item parent if we are not a list item
    let styleTarget = _itemElement;
    if(styleTarget.tagName !== 'li')
      styleTarget = styleTarget.closest('li')
    styleTarget.classList.add('selected');

    // TODO: event on selection changed    
    let dataIndex = styleTarget.getAttribute('data-index')
    if(this.currentSelectedIdx != dataIndex)
    {
      this.previousSelectedIdx = this.currentSelectedIdx;
      this.currentSelectedIdx = dataIndex;
      this.dispatchEventSelectionChanged(this.currentSelectedIdx, this.listData[dataIndex]);
    }
  }


  async addItem(_itemData, _select = false)
  {
    this.listData.push(_itemData)
    // TODO: select new created state with id....
    this.requestUpdate();
    await this.updateComplete;
    this.selectListItem(this.listData.length - 1);     
    this.dispatchEventItemAdded(this.listData.length - 1, _itemData);
  }

  async deleteItem(_index) 
  {    
    const savedItemData = Object.assign({}, this.getListItem());
    this.listData = this.listData.filter((_, i) => i !== _index)
    await this.updateComplete;  

    // if we are deleteing the currently marked item, we have no actual selection anymore
    // and the previouse selection is not applicable too!
    if(this.currentSelectedIdx == _index)         
      this.selectListItem(-1, -1); 
    // if we delete an item which is before the selection, the selection will move down to
    // stay on the correct item
    else if(this.currentSelectedIdx > _index)
      this.selectListItem(this.currentSelectedIdx - 1);

    // let the user know that an item was deleted
    this.dispatchEventItemDeleted(savedItemData);
  }

  dispatchEventSelectionChanged(_idx, _itemData, prevIdx = this.previousSelectedIdx , _prevItemData = this.getListItem(this.previousSelectedIdx))
  {
    const event = new CustomEvent('selectionChanged', {detail: { idx: _idx, item: _itemData, prevIdx: prevIdx, prevItem: _prevItemData }, bubbles: true, composed: true });
    this.dispatchEvent(event);
  } 

  dispatchEventItemDeleted(_itemData)
  {
    const event = new CustomEvent('itemDeleted', {detail: { item: _itemData }, bubbles: true, composed: true });
    this.dispatchEvent(event);
  } 

  dispatchEventItemAdded(_idx, _itemData)
  {
    const event = new CustomEvent('itemAdded', {detail: { idx: _idx, item: _itemData }, bubbles: true, composed: true });
    this.dispatchEvent(event);
  } 

  get _input() {
    return this.renderRoot?.querySelector("#fullname") ?? null
  }
  
}

customElements.define('gui-simplelist', GuiSimpleList);