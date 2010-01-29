<?php

function running_on_toolserver()
{
    if (!isset($_SERVER['SERVER_NAME'])) return isset($_SERVER['SSH_CONNECTION']);
    return preg_match("/\btoolserver\.org$/", $_SERVER['SERVER_NAME']) ? true : false;
}

function connect_to_db($dbname)
{
    if (running_on_toolserver())
    {
        $toolserver_mycnf = parse_ini_file('/home/' . get_current_user() . '/.my.cnf');
        $db = mysql_connect("$dbname-p.db.toolserver.org", $toolserver_mycnf['user'], $toolserver_mycnf['password']);
        if (!$db) return null;
        if (!mysql_select_db("{$dbname}_p", $db)) return null;
        unset($toolserver_mycnf);
        return $db;
    }
    else
    {
        $db = mysql_connect('127.0.0.1', 'wikiuser', 'wikipass');
        if (!$db) return null;
        if (!mysql_select_db('wikidb', $db)) return null;
        return $db;
    }
}

function get_pageid($db, $ns, $pagetitle)
{
    $query = mysql_query('SELECT page_id FROM page WHERE page_namespace = ' . intval($ns) . ' AND page_title=\'' . mysql_real_escape_string($pagetitle) . '\'');
    if (!$query) return null;
    $result = mysql_fetch_row($query);
    if (!$result) return null;
    return $result[0];
}

function get_last_edit_timestamp($db)
{
    $query = mysql_query('SELECT rc_timestamp FROM recentchanges ORDER BY rc_timestamp DESC LIMIT 1');
    if (!$query) return null;
    $result = mysql_fetch_row($query);
    if (!$result) return null;
    return $result[0];
}
