import './scss/styles.scss'
import * as bootstrap from 'bootstrap'

enum Ordering {
    alpha = "alpha",
    chrono = "chrono"
};

// https://www.wikidata.org/w/api.php?action=query&format=json&origin=*&prop=revisions&formatversion=2&rvprop=ids%7Ctimestamp%7Cflags%7Ccomment%7Cuser%7Cparsedcomment%7Ccontent%7Cuserid&rvslots=main&rvlimit=10&titles=Q732678

let ordering = Ordering.chrono;
let data: any = null;

function init() {
    bootstrap.Dropdown.toString();

    document.querySelectorAll('#navComboOrdering a').forEach(elem => elem.addEventListener('click', handleOrderingChange));
    document.querySelectorAll('button[role=search]').forEach(elem => elem.addEventListener('click', handleLoadClick));

    renderScreen();
}

function handleLoadClick() {
    data = { labels: {} };
    renderScreen();
}

function handleOrderingChange(this: HTMLElement) {
    ordering = <Ordering>this.getAttribute('data-ordering');
    refreshOrdering();
}

function refreshOrdering() {
    document.querySelectorAll('#navComboOrdering a').forEach(elem => {
        elem.classList.remove('active');
        elem.setAttribute('aria-current', 'false');
    });
    const $activeItem = document.querySelector(`#navComboOrdering a[data-ordering=${ordering}]`);
    $activeItem.classList.add('active');
    $activeItem.setAttribute('aria-current', 'true');
    renderScreen();
}

function renderScreen() {
    const $mainContainer = document.getElementById('mainContainer');
    if (data === null) {
        $mainContainer.style.display = 'none';
        document.getElementById('emptyScreen').style.display = 'block';
    } else {
        document.getElementById('emptyScreen').style.display = 'none';
        $mainContainer.style.display = 'none';
        renderData();
        $mainContainer.style.display = 'block';
    }
}

function renderData() {
    renderSection('sectionContentLabelling', data.labels);
    renderSection('sectionContentClaims', data.claims);
    renderSection('sectionContentSitelinks', data.sitelinks);
}

function renderSection(containerId: string, labels: object) {
    const $container = document.getElementById(containerId);
    $container.innerHTML = '';
}

window.onload = init;
