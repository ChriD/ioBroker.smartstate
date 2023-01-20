
// this function will format a string (in this case the name of the device) to a valid object id which can be used 
// in the backend. The format will be done in the adapter backend because there we have 'FORBIDDEN_CHARS' available
function formatObjectId(_value)
{
    //FORBIDDEN_CHARS of iobroker: [^._\-/ :!#$%&()+=@^{}|~\p{Ll}\p{Lu}\p{Nd}]+
    //const forbiddenChars = RegExp(/[^._\-/ :!#$%&()+=@^{}|~\p{Ll}\p{Lu}\p{Nd}]/);
    let validObjectId = _value.replace(/ä/g, 'ae');
    validObjectId = validObjectId.replace(/ö/g, 'oe');
    validObjectId = validObjectId.replace(/ü/g, 'ue');
    validObjectId = validObjectId.replace(/ß/g, 'ss');
    validObjectId = validObjectId.replace(/Ä/g, 'Ae');
    validObjectId = validObjectId.replace(/Ö/g, 'Oe;');
    validObjectId = validObjectId.replace(/Ü/g, 'Ue;');
    validObjectId = validObjectId.replace(/[^\w\s]/gi, '');
    validObjectId = validObjectId.replace(/[\.\s\/]/g, '_');

    return validObjectId;
}

// this function will get the row index for an element which is within the child state grid or for the row 
// element itself
function getTableRowDataIndex(_childOrRowElement)
{
    let rowElement = _childOrRowElement.tagName instanceof HTMLTableRowElement ? _childOrRowElement : _childOrRowElement.closest('tr');
    if(rowElement)
        return rowElement.getAttribute('data-index');
    return '';
}


function GUI2Object(_object)
{
    $('.value').each(function () {
        var $this = $(this);
        
        if ($this.attr('type') === 'checkbox') {
            _object[$this.attr('id')] = $this.prop('checked');
        } else if ($this.attr('type') === 'number') {
            _object[$this.attr('id')] = parseFloat($this.val());
        } else {
            _object[$this.attr('id')] = $this.val();
        }
    });            
}


function object2GUI(_object)
{
    $('.value').each(function () {
        var $key = $(this);
        var id = $key.attr('id');

        if($key.is('select'))
        {                                 
            $key.val(_object[id]).select();                  
        }
        else if ($key.attr('type') === 'checkbox') 
        {
            // do not call onChange direct, because onChange could expect some arguments
            $key.prop('checked', _object[id]);
        }            
        else
        {
            // do not call onChange direct, because onChange could expect some arguments
            $key.val(_object[id]);
        }
    });
    if (M) M.updateTextFields();
}