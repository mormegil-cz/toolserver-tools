window.onload = function() {
    var params = (new URL(document.location)).searchParams;
    var icao = params.get('icao');
    document.location.href = (icao && /^LK[A-Z]{2}$/i.test(icao)) ? ('https://aim.rlp.cz/vfrmanual/actual/' + icao.toLowerCase() + '_text_en.html') : 'https://aim.rlp.cz/vfrmanual/actual/ad_1_en.html';
};
