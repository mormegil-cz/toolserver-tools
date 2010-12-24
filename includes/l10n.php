<?php

function load_messages()
{
	global $uselang;
	$uselang = get_variable_or_null('uselang');
	if ($uselang == null || !preg_match('/^[a-z-]{1,10}$/', $uselang) || !file_exists("messages-$uselang.php")) $uselang = 'en';

	if (file_exists("messages-$uselang.php"))
	{
		global $messages;
		include("messages-$uselang.php");
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
