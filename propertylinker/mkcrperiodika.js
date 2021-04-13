window.onload = function() {
    var params = (new URL(document.location)).searchParams;
    var regNumber = params.get('reg');
    var match = regNumber && regNumber.match(/^([EČRF]) *([1-9][0-9]{0,4})$/i);
    if (match) {
        document.getElementById('filterEvCislo').value = match[1].toUpperCase() + ' ' + match[2];
        document.forms[0].submit();
    } else {
        document.location.href = 'https://www.mkcr.cz/databaze-periodickeho-tisku-pro-verejnost-978.html';
    }
};
