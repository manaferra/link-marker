var nextLinkToLoad = [];
var currentLink = [];
var allLinks = [];
var activeIndex = 0;
var totalItems = 0;
var iframeInjected = false;
var urlParams = new URLSearchParams(window.location.search);
var activeLinks = [];

chrome.storage.sync.get(['activeIndex'], function(item) {
    if (typeof item.activeIndex !== 'undefined') {
        activeIndex = item.activeIndex;
    } 
});

//Get Links from chrome storage
chrome.storage.local.get(['linkMarkerLinks'], function(items) {
    if (typeof items.linkMarkerLinks !== 'undefined') {
        currentLink = items.linkMarkerLinks[activeIndex];
        allLinks = items.linkMarkerLinks;

        if (typeof items.linkMarkerLinks[activeIndex + 1] !== 'undefined') {
            nextLinkToLoad = items.linkMarkerLinks[activeIndex + 1];
        }

        activeLinks = allLinks.map(obj => obj.url);
        activeLinks.forEach((activeLink) => {
            // Show prospector if domain matches
            if (activeLink.includes(document.location.href)) {
                showProspector();
            }
        })
    } 
});

chrome.storage.sync.get(['totalItems'], function(item) {
    if (typeof item.totalItems !== 'undefined') {
        totalItems = item.totalItems;
    } 
});

//listen to events/messages
chrome.runtime.onMessage.addListener(function(message, sender, optional){
    if(message === "toggle"){
        toggle(sender.id);
    } else {
        if (typeof message.pageIndex !== 'undefined') {
            chrome.storage.sync.set({'activeIndex': message.pageIndex});
            loadLinkByIndex(message.pageIndex);
        }
       
        if ( typeof message === 'object') {
            // Check data for next links
            if ( typeof message.fileData !== 'undefined') {
                
                addLinksToStorage(message);
            }

            if (typeof message.start_prospecting !== 'undefined'){
                startProspecting();
            }

            if (typeof message.reset_data !== 'undefined'){
                resetData();
            }
            
            if ( typeof message.showNextSite !== 'undefined') {

                if (nextLinkToLoad == null){
                    chrome.storage.local.set({'linkMarkerLinks': []});
                    chrome.storage.sync.set({'activeIndex': 0});
                    chrome.storage.sync.set({'totalItems': 0});
                    alert('All links are reviewed.');

                    if (currentLink.url) {
                        location.reload(); 
                    }

                } else  if (typeof nextLinkToLoad === 'undefined') {
                    chrome.storage.local.set({'linkMarkerLinks': []});
                    chrome.storage.sync.set({'activeIndex': 0});
                    chrome.storage.sync.set({'totalItems': 0});
                    alert('All links are reviewed.');
                    
                    if (currentLink.url) {
                        location.reload(); 
                    }
                } else {
                    let status = 'not_qualified';
                    if (message.status == 'approve') status = 'qualified';

                    let note = '';
                    if (message.data.note) note = message.data.note;
 
                    currentLink = {
                        url: message.data.link, 
                        status: status, 
                        emails: message.emails, 
                        primaryEmail: message.primary_email,
                        title: message.data.title, 
                        note: note, 
                        website_name: message.data.site_name,
                        dr: message.data.dr
                    };

                    allLinks[activeIndex] = currentLink;

                    if (currentLink.url == nextLinkToLoad.url) {
                        nextLinkToLoad.url = allLinks[activeIndex + 1];
                    }

                    chrome.storage.local.set({linkMarkerLinks: allLinks});
                    chrome.storage.sync.set({activeIndex: activeIndex  + 1});

                    window.location.href = nextLinkToLoad.url;
                }
            }
        }
    }

});

window.onload = function (){
    //Show prospector
    if (urlParams.has('prospector') && urlParams.get('prospector') == 'true') {
        iframeInjected = false;
        showProspector();
    }
}

/**
 * Show Prospector Sidebar
 * @param tabID ID of current tab
 */
async function showProspector(tabID){
    //Get scraped data
    let activeLinks = allLinks.map(obj => obj.url);

    if (!iframeInjected) {
        //inject content
        injectCSS();
        injectIframe();
    }

    forceExtensionDisplay();
    
    window.onload = function (){
        sendPaginationData();
        forceExtensionDisplay();
    }  
}

function forceExtensionDisplay(){
    $.map($('body *'), function(e,n) {
        if (parseInt($(e).css('z-index')) > 2147483646){
            $(e).css('z-index', 2147483646);
        };
    });
}

/**
 * Insert DOM after a DOM
 * @param el
 * @param referenceNode
 */
function insertAfterDOM(el, referenceNode) {
    referenceNode.parentNode.insertBefore(el, referenceNode.nextSibling);
}

/**
 * Hide Prospcetor Sidebar
 */
function hideProspector(){

    //remove prosector's html
    iframe = document.getElementById("prospector-extension");
    css = document.getElementById("prospector-stylesheet");
    iframe.remove();
    css.remove();

    iframe2 = document.getElementById("prospector-extension-pagination");
    iframe2.remove();
    iframeInjected = false;

    //remove html class
    var html = document.getElementsByTagName( 'html' )[0];
    html.classList.remove("prospector-on");
}

/**
 * Inject Iframe
 */
function injectIframe(){
    var iframe = document.createElement('iframe');
    iframe.className = "prospector";
    iframe.id = "prospector-extension";
    iframe.style.display = "none";
    iframe.src = chrome.extension.getURL("index.html")

    var header = document.querySelector('head');
    insertAfterDOM(iframe, header);
    document.getElementById('prospector-extension').onload= function() {
        setInitialDataToAngular();
    }; 

    var paginationIframe = document.createElement('iframe');
    paginationIframe.style.display = "block";
    paginationIframe.id = "prospector-extension-pagination";
    paginationIframe.src = chrome.extension.getURL("elements/element.html")
    insertAfterDOM(paginationIframe, header);

    iframeInjected = true;
}

/**
* Send initial data to Angular
*/
async function setInitialDataToAngular(){
    var theLinkToLoad = currentLink;
    if ( typeof currentLink !== 'undefined' && currentLink != null) {
        if (!theLinkToLoad.status) theLinkToLoad.status = 'under_review';
    } else {
        theLinkToLoad =  {url: '', status: '', emails: [], website_url: '', title: '', note: '', website_name: ''};
    }

    // Get site name
    let siteName = $('meta[property="og:site_name"]').attr('content');
    var domainURL = window.location.href.split("/");
    if (!siteName) {
        siteName = domainURL[2].split('.');
        siteName = siteName[ siteName.length - 2 ];
    }

    // Get page title
    let pageTitle = $('meta[property="og:title"]').attr('content');
    if (!pageTitle) {
        pageTitle = $('title').html();
    }

    theLinkToLoad.website_url = domainURL[2];
    theLinkToLoad.title = pageTitle;
    theLinkToLoad.website_name = siteName;

    if (currentLink.title && currentLink.title != '') theLinkToLoad.title = currentLink.title;
    if (currentLink.link && currentLink.link != '') theLinkToLoad.link = currentLink.link;
    if (currentLink.note && currentLink.note != '') theLinkToLoad.note = currentLink.note;
    if (currentLink.site_name && currentLink.site_name != '') theLinkToLoad.site_name = currentLink.site_name;

    let data = {
        linkData: theLinkToLoad
    }

    chrome.runtime.sendMessage(data);

    chrome.storage.local.get(['linkMarkerLinks'], function(items) {
        if (typeof items.linkMarkerLinks !== 'undefined') {
            if (items.linkMarkerLinks[activeIndex + 1]) {
                nextLinkToLoad = items.linkMarkerLinks[activeIndex + 1];
            } else {
                nextLinkToLoad = null;
            }
            
        } 
    });

    sendEmails();
    sendAllLinks(); 
    sendPaginationData();
}

/**
 * Inject CSS
 */
function injectCSS(){
    var link = document.createElement("link");
    link.href = chrome.extension.getURL("style.css");
    link.type = "text/css";
    link.rel = "stylesheet";
    link.id = "prospector-stylesheet";

    var header = document.querySelector('head');
    insertAfterDOM(link, header);

    //html class
    var html = document.getElementsByTagName( 'html' )[0];
    html.setAttribute( 'class', 'prospector-on' );
}

/**
 * Toogle EXtension Icon Click
 * @param tabID ID of current tab
 */
function toggle(tabID){
    iframe = document.getElementById("prospector-extension");

    if(!iframe){
        showProspector();

    } else {
        hideProspector(tabID);
    }
}

/**
 * Add Links to Storage
 * @param {array} message 
 */
function addLinksToStorage(message){
    allLinks = [];
    message.fileData.forEach(function(linkItem){
        let newItem = { url: linkItem };
        allLinks.push(newItem);
    });
    chrome.storage.local.set({'linkMarkerLinks': allLinks});

    let nextIndex = activeIndex + 1;
    currentLink = allLinks[activeIndex];
    currentLink = allLinks[activeIndex];

    if(typeof allLinks[nextIndex] !== 'undefined'){
        nextLinkToLoad = allLinks[nextIndex];
    } 
    
    chrome.storage.sync.set({'totalItems': allLinks.length});
}

/*
* Load link by pagination index
*/
function loadLinkByIndex(pageIndex) {
   
    let urlByIndex = allLinks[pageIndex].url;
    
    window.location.href = urlByIndex;
}

/*
* Send pagination data to pagination element
*/
function sendPaginationData(){
    if (totalItems != 0){
        let data = {
            active_index: activeIndex,
            batch_items_count: totalItems
        };

        chrome.runtime.sendMessage(data);
    }
}

function sendEmails(){
    if (currentLink.emails && currentLink.emails.length > 0) {
        chrome.runtime.sendMessage({
            emails: currentLink.emails
        });
    }
}

function sendAllLinks(){
    chrome.runtime.sendMessage({
        allLinks: allLinks
    });
}

/*
 * Remove query param from URL
*/
function removeParam(key, sourceURL) {
    var rtn = sourceURL.split("?")[0],
        param,
        params_arr = [],
        queryString = (sourceURL.indexOf("?") !== -1) ? sourceURL.split("?")[1] : "";
    if (queryString !== "") {
        params_arr = queryString.split("&");
        for (var i = params_arr.length - 1; i >= 0; i -= 1) {
            param = params_arr[i].split("=")[0];
            if (param === key) {
                params_arr.splice(i, 1);
            }
        }
        rtn = rtn + "?" + params_arr.join("&");
    }
    return rtn;
}

/**
 * Reset data
 */
function resetData(){
    chrome.storage.local.set({'linkMarkerLinks': []});
    chrome.storage.sync.set({'activeIndex': 0});
    chrome.storage.sync.set({'totalItems': 0});
}

/**
 * Start Prospecting
 */
function startProspecting(){
    if (currentLink) {
        window.location.href = currentLink.url;
    }
}