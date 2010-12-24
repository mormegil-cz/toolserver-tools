<?php

function get_variable_or_null($id)
{
	if (isset($_POST[$id])) return $_POST[$id];
	if (isset($_GET[$id])) return $_GET[$id];
	return null;
}
