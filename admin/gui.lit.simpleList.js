//import {html, css, LitElement, live, map, repeat} from 'lit-all.min.js';
import {LitElement, html, unsafeHTML, css, map} from 'https://cdn.jsdelivr.net/gh/lit/dist@2/all/lit-all.min.js';

// TODO: key down & up

class GuiSimpleList extends LitElement {

  static styles = css`
      :host {
        display: block;
        border: solid 1px gray;
        padding: 16px;
        max-width: 800px;
      }
      
      ul {
        list-style-type: none;
        margin: 0;
        padding: 0;
      }
      ul li {
        display: flex;
        align-items: center;        
        padding-bottom: 10px;
        padding-top: 10px;        
        border-bottom:1px solid green;
      }            

      ul li .left {
        flex: 1;
        overflow: hidden;
        white-space: nowrap;
      }

      ul li .right {
        flex: 0 0 2em;
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
    <div>
      <input id="fullname" type="text"><button @click=${() => this.addItem({ name: this._input.value}, true)}>Add</button>
    </div>
    <div>
      <h2>${this.name}</h2>
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

/*
  returnString() {
      var frag = document.createRange().createContextualFragment(`${ this.str }`);
    return frag;
  }
  */



  listItemClicked(_event) {    
    
    // TODO ousource in method
    
    // if we hot on an element which should not trigger selection then skip
    if(_event.target.hasAttribute('itemselectdisabled'))
      return;    
    
    this.selectListItemFromElement(_event.target);
  }

  selectListItem(_index)
  {
    if(_index < 0)
    {
      this.unselectItems();
      return;
    }

    const element = this.shadowRoot.querySelector(`li[data-index="${_index}"]`)
    if(element)    
      this.selectListItemFromElement(element);    
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
      this.currentSelectedIdx = dataIndex;
      this.dispatchEventSelectionChanged(this.listData[dataIndex]);
    }
  }


  async addItem(_itemData, _select = false)
  {
    this.listData.push(_itemData)
    // TODO: select new created state with id....
    this.requestUpdate();
    await this.updateComplete;
    this.selectListItem(this.listData.length - 1);        
  }

  async deleteItem(_index) 
  {    
    this.listData = this.listData.filter((_, i) => i !== _index)

    // update selection
    // if selected item was delete -> select none
    // if item after selected item was delete -> do nothing
    // if item before selected item was delete -> reselect item!
    let newSelection = this.currentSelectedIdx;
    if(this.currentSelectedIdx == _index)
      newSelection = -1;
    else if(this.currentSelectedIdx > _index)
      newSelection = this.currentSelectedIdx - 1;    

    if(newSelection != this.currentSelectedIdx)
    {
      await this.updateComplete;
      this.selectListItem(newSelection);
    }
  }

  dispatchEventSelectionChanged(_itemData)
  {
    const event = new CustomEvent('selectionChanged', {detail: { item: _itemData }, bubbles: true, composed: true });
    this.dispatchEvent(event);
  }

  get _input() {
    return this.renderRoot?.querySelector("#fullname") ?? null
  }
  
}

customElements.define('gui-simplelist', GuiSimpleList);