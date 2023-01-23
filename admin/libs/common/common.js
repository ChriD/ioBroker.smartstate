// this function will format a string to a valid object id which can be used
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


// this function will format a string to a valid path which can be used
// in the backend. The format will be done in the adapter backend because there we have 'FORBIDDEN_CHARS' available
function formatPath(_value)
{
    //FORBIDDEN_CHARS of iobroker: [^._\-/ :!#$%&()+=@^{}|~\p{Ll}\p{Lu}\p{Nd}]+
    //const forbiddenChars = RegExp(/[^._\-/ :!#$%&()+=@^{}|~\p{Ll}\p{Lu}\p{Nd}]/);
    let validPath = _value.replace(/ä/g, 'ae');
    validPath = validPath.replace(/ö/g, 'oe');
    validPath = validPath.replace(/ü/g, 'ue');
    validPath = validPath.replace(/ß/g, 'ss');
    validPath = validPath.replace(/Ä/g, 'Ae');
    validPath = validPath.replace(/Ö/g, 'Oe;');
    validPath = validPath.replace(/Ü/g, 'Ue;');
    validPath = validPath.replace(/[^\w\s\.]/gi, '');
    validPath = validPath.replace(/[\s\/]/g, '_');
    // remove trailing '.'
    validPath = validPath.replace(/\.+$/, '');
    // remove staring '.'
    validPath = validPath.replace(/^\.+/, '');

    return validPath;
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


// a little helper function to copy data from gui elements to an object
function GUI2Object(_object)
{
    $('.value').each(function () {
        const $this = $(this);
        if ($this.attr('type') === 'checkbox') {
            _object[$this.attr('id')] = $this.prop('checked');
        } else if ($this.attr('type') === 'number') {
            _object[$this.attr('id')] = parseFloat($this.val());
        } else {
            _object[$this.attr('id')] = $this.val();
        }
    });
}

// a little helper function to copy data object to gui elements
function object2GUI(_object)
{
    $('.value').each(function () {
        const $key = $(this);
        const id = $key.attr('id');

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