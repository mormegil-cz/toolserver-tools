$(function() {
	var $table = $('#suggestions');
	if (!$table.length) return;

	var $wikimarkup = $('<div>');
	$('body').append($wikimarkup);

	var $button = $('<button>');
	$button.text(uiMessages['showList']);
	$wikimarkup.append($button);

	$button.click(function() {
		$div = $('div');
		$textarea = $('<textarea cols="60" rows="10">');
		$div.append($textarea);

		$copy = $('<button>').text(uiMessages['copy']);
		$copy.click(function() {
			$textarea[0].select();
			try {
				document.execCommand('copy');
			} catch (err) {
			}
			return false;
		});
		$div.append($copy);

		var code = '';
		$table.find('tbody tr td[class="local-link"] a').each(function() {
			code = code + "* [[" + $(this).text() + "]]\n";
		});
		$textarea.val(code);

		$wikimarkup.append($div);
		$button.remove();
	});
});
