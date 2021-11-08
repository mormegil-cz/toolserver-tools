<?php

/*
ini_set('display_errors', '1');
error_reporting(E_ALL | E_STRICT);
*/

function showError($msg) {
?>
<!DOCTYPE html>
<html>
    <head>
        <meta charset="UTF-8" />
        <title>Link to Czech Aircraft Register</title>
    </head>
    <body>
        <div id="content">
			<p id="errorMessage"><?php echo $msg; ?></p>
			<ul>
				<li><a href="https://lr.caa.cz/letecky-rejstrik?lang=en">Go to the Aircraft Register</a></li>
				<li><a href="#" onclick="history.back(); return false;">Go back</a></li>
			</ul>
        </div>
    </body>
</html>
<?php
}

function query($id) {
	$incomingXff = isset($_SERVER['HTTP_X_FORWARDED_FOR']) ? $_SERVER['HTTP_X_FORWARDED_FOR'] : null;
	$xff = $_SERVER['REMOTE_ADDR'];
	if ($incomingXff) {
		$xff .= ",$incomingXff";
	}
	$userAgent = $_SERVER['HTTP_USER_AGENT'];
	
	$request = curl_init("https://lr.caa.cz/api/avreg/filtered?start=0&length=10&search=registration_number~%5E~$id");
	curl_setopt($request, CURLOPT_RETURNTRANSFER, true);
	curl_setopt($request, CURLOPT_FOLLOWLOCATION, false);
	curl_setopt($request, CURLOPT_MAXREDIRS, 0);
	curl_setopt($request, CURLOPT_HTTPHEADER, array('X-Forwarded-For: $xff', 'User-Agent: $userAgent'));
	$data = curl_exec($request);

	if ($data === false) {
		$statuscode = curl_getinfo($request, CURLINFO_HTTP_CODE);
		$errno = curl_errno($request);
		$errtext = curl_error($request);
        return "$errno/$statuscode: $errtext";
	}

	curl_close($request);

	return json_decode($data, true);
}

function doRedirect($url) {
	header('HTTP/1.0 302 Found');
	header("Location: $url");
}

if ($_SERVER['REQUEST_METHOD'] != 'GET') {
	header('HTTP/1.0 405 Method Not Allowed');
	echo 'HTTP request method not allowed';
	return;
}

$id = isset($_GET['id']) ? $_GET['id'] : '';
$id = strtoupper(trim($id));

if (!$id || (substr($id, 0, 3) != 'OK-')) {
	showError('Use <code>?id=OK-XXX</code> in the URL to redirect to the Aircraft Register.');
	return;
}

$suffix = substr($id, 3);

if (preg_match('/^[A-Z]{3}[ -][0-9]{2}$/', $suffix)) {
	showError('Ultralight aircraft (registrations in the form of <code>OK-XXX 00</code>) are not registered in the Aircraft Register.');
	return;
}
if (preg_match('/^A[0-9]{3}$/', $suffix)) {
	showError('Ultralight gliders (registrations in the form of <code>OK-A000</code>) are not registered in the Aircraft Register.');
	return;
}
if (preg_match('/^X[0-9]{3}[A-Z]$/', $suffix)) {
	showError('Unmanned aircraft registrations (in the form of <code>OK-X000A</code>) are not public.');
	return;
}

if (!preg_match('/^([A-Z]{3,4}|[0-9]{4})$/', $suffix)) {
	showError('Invalid registration number format.');
	return;
}

$data = query($suffix);
if (!is_array($data) || !isset($data['total']) || !isset($data['rows'])) {
	showError('Error querying the Aircraft Register.');
	// var_dump($data);
	return;
}

$totalCount = intval($data['total']);
if ($totalCount == 0 || count($data['rows']) == 0) {
	showError("Aircraft registration not found in the Aircraft Register");
	return;
}

$resultId = $data['rows'][0]['id'];

doRedirect("https://lr.caa.cz/letecky-rejstrik/$resultId?lang=en");
