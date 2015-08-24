$(function() {
    var $scratchspace = $('<div>');
    $('body').append($scratchspace);
    $scratchspace.hide();

    $textarea = $('<textarea cols="60" rows="10">');
    $scratchspace.append($textarea);

    $copy = $('<button>').text(uiMessages['copy']);
    $copy.click(function() {
        $textarea[0].select();
        try {
            document.execCommand('copy');
        } catch (err) {
        }
        return false;
    });
    $scratchspace.append($copy);

    function update() {
        var val = [];
        $table.find('tbody tr').has('input:checked').find('td:first-child').each(function() {
            val.push('[[' + uiMessages['categoryns'] + ':' + $(this).text().trim() + ']]');
        });
        $textarea.val(val.join("\n"));
        if (val.length) $scratchspace.show();
        else $scratchspace.hide();
    }

    var $table = $('#suggestions');
    if (!$table.length) return;

    var $header = $table.find('thead tr.header');
    $header.append('<th>+</th>');

    $table.find('tbody tr').append(function() {
        var $td = $('<td>');
        var $cb = $('<input type="checkbox">');
        $cb.click(update);
        $td.append($cb);
        $(this).append($td);
    });
});
