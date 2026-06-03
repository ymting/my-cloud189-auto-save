"use strict";
class Loading {
    constructor() {
        this.loadingElement = null;
    }
    show() {
        if (this.loadingElement)
            return;
        this.loadingElement = document.createElement('div');
        this.loadingElement.className = 'loading-overlay';
        this.loadingElement.innerHTML = '<div class="loading-spinner"></div>';
        document.body.appendChild(this.loadingElement);
    }
    hide() {
        if (!this.loadingElement)
            return;
        this.loadingElement.remove();
        this.loadingElement = null;
    }
}
const loading = new Loading();
