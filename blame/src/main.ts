import './scss/styles.scss'
import * as bootstrap from 'bootstrap'

enum Ordering {
    alpha = "alpha",
    chrono = "chrono"
};

let ordering = Ordering.chrono;

function init() {
    bootstrap.Dropdown.toString();

    document.querySelectorAll('#navComboOrdering a').forEach(elem => elem.addEventListener('click', handleOrderingChange));
}

function handleOrderingChange(this: HTMLElement) {
    ordering = <Ordering>this.getAttribute('data-ordering');
    console.log('Chosen ', ordering);
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
}

window.onload = init;
