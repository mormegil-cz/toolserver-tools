<?php

function get_accept_language($supportedlangs)
{
	if (!isset($_SERVER['HTTP_ACCEPT_LANGUAGE'])) return $supportedlangs[0];

	$acceptlanguage = $_SERVER['HTTP_ACCEPT_LANGUAGE'];
	
	preg_match_all('/((\\*)|([a-z]{1,8}(-[a-z]{1,8})*))\s*(;\s*q\s*=\s*([01](\.[0-9]*)?))?/i', $acceptlanguage, $lang_parse);
	if (!count($lang_parse[1])) return $supportedlangs[0];

	$langs = array_combine($lang_parse[1], $lang_parse[6]);

	foreach ($langs as $lang => $val)
	{
		if ($val === '') $langs[$lang] = 1;
	}

	arsort($langs, SORT_NUMERIC);

	$bestlang = null;
	$bestscore = 0;
	foreach ($supportedlangs as $lang)
	{
		$l = $lang;
		while(true)
		{
			if (isset($langs[$l]))
			{
				$score = $langs[$l];
				if ($score > $bestscore)
				{
					$bestscore = $score;
					$bestlang = $lang;
				}
				break;
			}

			$hyphen = strrpos($l, '-');
			if (!$hyphen) break;
			$l = substr($l, 0, $hyphen - 1);
		}
	}

	if ($bestscore > 0) return $bestlang;

	if (isset($langs['*']) && $langs['*'] > 0) return $supportedlangs[0];

	// no language is acceptable
	// return false;
	return $supportedlangs[0];
}

function load_messages()
{
	global $uselang, $available_languages;
	$uselang = get_variable_or_null('uselang');
	if ($uselang == null || !in_array($uselang, $available_languages))
	{
		$uselang = get_accept_language($available_languages);
		if (!$uselang) {
			header('HTTP/1.0 406 Not Acceptable');
			die ('No requested language is supported; try using ?uselang=' . $available_languages[0]);
		}
	}

	if (file_exists("messages-$uselang.php"))
	{
		global $messages;
		include("messages-$uselang.php");
		header('Content-Language: ' . $uselang);
	}
}

function wfMsg($msgid)
{
	global $messages;
	return isset($messages[$msgid]) ? $messages[$msgid] : "{$msgid}";
}

function format_message($msgid)
{
	$message = wfMsg($msgid);

	$args = func_get_args();
	array_shift($args);
	if (count($args))
	{
		$replacementKeys = array();
		foreach($args as $n => $param)
		{
			$replacementKeys['$' . ($n + 1)] = $param;
		}
		$message = strtr($message, $replacementKeys);
	}

	return $message;
}

load_messages();
