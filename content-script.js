var nextLinkToLoad = [];
var currentLink = [];
var allLinks = [];
var activeIndex = 0;
var totalItems = 0;
var iframeInjected = false;
var urlParams = new URLSearchParams(window.location.search);
var activeLinks = [];
var brokenLinks = [];
var selectedBrokenLink = {};

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
        let pageURL = document.location.href;
        //pageURL = pageURL.replace(/(^\w+:|^)\/\//, '');
        pageURL = pageURL.split('/');

        activeLinks.forEach((activeLink) => {
            // Show prospector if domain matches
            if (activeLink.includes(pageURL[2])) {
                showProspector();
            }
        })
    } else {
        chrome.storage.local.set({'linkMarkerLinks': []});
        allLinks = [];
        currentLink = null;
    }
});

chrome.storage.sync.get(['totalItems'], function(item) {
    if (typeof item.totalItems !== 'undefined') {
        totalItems = item.totalItems;
    }
});

chrome.storage.local.get(['linkMarker_brokenLinks'], function(items) {
    if (typeof items.linkMarker_brokenLinks !== 'undefined') {
        brokenLinks = items.linkMarker_brokenLinks;
    }
});

chrome.storage.local.get(['linkMarker_selectedBrokenLinks'], function(items) {
    if (typeof items.linkMarker_selectedBrokenLinks !== 'undefined') {
        selectedBrokenLink = items.linkMarker_selectedBrokenLinks;
    }
});

//listen to events/messages
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse){

    if(message === "toggle"){
        toggle(sender.id);
    } else {
        if (typeof message.pageIndex !== 'undefined') {
            chrome.storage.sync.set({'activeIndex': message.pageIndex});
            chrome.storage.local.set({'linkMarker_brokenLinks': []});
            chrome.storage.local.set({'linkMarker_selectedBrokenLinks': {}});
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

            if (typeof message.links_exported !== 'undefined'){
                removeExportedLinks();
            }

            if (typeof message.broken_links_check !== 'undefined' && message.broken_links_check){
                scrapeBrokenLinks();
            }

            if ( typeof message.broken_links !== 'undefined') {
                chrome.storage.local.set({'linkMarker_brokenLinks': message.broken_links});
                brokenLinks = message.broken_links;
                highlightBrokenLinks();
            }

            if ( typeof message.highlight_broken_link !== 'undefined') {
                scrollToBrokenLink(message.highlight_broken_link);
            }

            if ( typeof message.showNextSite !== 'undefined') {
                if (typeof nextLinkToLoad === 'undefined' || nextLinkToLoad == null){
                    setCurrentLinkData(message);
                    chrome.runtime.sendMessage({
                        allLinks: allLinks
                    });

                    chrome.storage.local.set({'linkMarkerLinks': []});
                    chrome.storage.sync.set({'activeIndex': 0});
                    chrome.storage.sync.set({'totalItems': 0});
                    chrome.storage.local.set({'linkMarker_brokenLinks': []});
                    chrome.storage.local.set({'linkMarker_selectedBrokenLinks': {}});

                    chrome.runtime.sendMessage({
                        link_marker_review_finished: true
                    });

                    activeIndex = 0;
                    totalItems = 0;
                    sendPaginationData();
                } else {
                    chrome.storage.local.set({'linkMarker_brokenLinks': []});
                    chrome.storage.local.set({'linkMarker_selectedBrokenLinks': {}});
                    setCurrentLinkData(message);
                    window.location.href = nextLinkToLoad.url;
                }
            }
        }
    }

    sendResponse();  // if you uncomment this line, error will disappear...
    return true; // if you uncomment this line, error will also disappear (indicates async callback)

});

function setCurrentLinkData(message){
    let status = 'not_qualified';
    if (message.status == 'approve') status = 'qualified';

    let note = '';
    if (message.data.note) note = message.data.note;

    var domainURL = window.location.href.split("/");
    currentLink = {
        title: message.data.title,
        url: message.data.link,
        status: status,
        website_name: message.data.site_name,
        website_url: domainURL[2],
        dr: message.data.dr,
        emails: message.emails,
        primaryEmail: message.primary_email,
        note: note,
        brokenLinks: brokenLinks,
        selected_broken_link: selectedBrokenLink
    };

    allLinks[activeIndex] = currentLink;

    if (nextLinkToLoad && nextLinkToLoad != null && currentLink.url == nextLinkToLoad.url) {
        nextLinkToLoad.url = allLinks[activeIndex + 1];
    }

    chrome.storage.local.set({linkMarkerLinks: allLinks});
    chrome.storage.sync.set({activeIndex: activeIndex  + 1});
}

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
    highlightBrokenLinks();
    highlightEmails();

    window.onload = function (){
        sendPaginationData();
        forceExtensionDisplay();
        highlightBrokenLinks();
        highlightEmails();
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

    if (currentLink && currentLink.title != '') theLinkToLoad.title = currentLink.title;
    if (currentLink && currentLink.link != '') theLinkToLoad.link = currentLink.link;
    if (currentLink && currentLink.note != '') theLinkToLoad.note = currentLink.note;
    if (currentLink && currentLink.site_name != '') theLinkToLoad.site_name = currentLink.site_name;

    if (brokenLinks.length){
        currentLink.brokenLinks = brokenLinks;

        if (!currentLink.selected_broken_link && selectedBrokenLink && selectedBrokenLink.url) {
            currentLink.selected_broken_link = selectedBrokenLink;
        }
    }

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
    let data = {
        active_index: activeIndex,
        batch_items_count: totalItems
    };

    chrome.runtime.sendMessage(data);

}

function sendEmails(){
    if (currentLink && currentLink.emails && currentLink.emails.length > 0) {
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
    chrome.storage.local.set({'linkMarker_brokenLinks': []});
    chrome.storage.local.set({'linkMarker_selectedBrokenLinks': {}});

    chrome.runtime.sendMessage({
        allLinks: []
    });

    activeIndex = 0;
    totalItems = 0;
    sendPaginationData();
}

/**
 * Start Prospecting
 */
function startProspecting(){
    if (currentLink) {
        window.location.href = currentLink.url;
    }
}

function removeExportedLinks(){
    let leftLinks = [];
    allLinks.forEach(item => {
        if (item.status != 'qualified' && item.status != 'not_qualified') {
            leftLinks.push(item);
        }
    });

    let newActiveIndex = activeIndex - (allLinks.length - leftLinks.length);
    chrome.storage.local.set({'linkMarkerLinks': leftLinks});
    chrome.storage.sync.set({'activeIndex': newActiveIndex});
    chrome.storage.sync.set({'totalItems': leftLinks.length});

    chrome.runtime.sendMessage({
        allLinks: leftLinks
    });


    totalItems = leftLinks.length;
    activeIndex = newActiveIndex;

    if (currentLink.status != 'under_review') {
        let checkReload  = false;

        for (var i = newActiveIndex; i < leftLinks.length; i++) {
            if (leftLinks[i] && leftLinks[i].status && (leftLinks[i].status == '' || leftLinks[i].status == 'under_review') && !checkReload) {
                chrome.storage.sync.set({'activeIndex': i});
                checkReload = true;
                window.location.href = leftLinks[i].url;
            }

            if (leftLinks[i] && typeof leftLinks[i].status == 'undefined' && !checkReload) {
                chrome.storage.sync.set({'activeIndex': i});
                checkReload = true;
                window.location.href = leftLinks[i].url;
            }
        }
    } else {
        chrome.storage.sync.set({'activeIndex': activeIndex});
        allLinks = leftLinks;
    }
    sendPaginationData();
}

function scrapeBrokenLinks(){
    let linksList = [];
    let content = $('body').html();

    if (content && content != null && content != '') {
        linksList = content.match(/(<\s*a[^>]*>(.*?)<\s*\/\s*a>)/gi)
    }

    let data = {
        foundLinks: linksList
    }
    chrome.runtime.sendMessage(data);
}

/**
 * Highlight Broken Links
 */
function highlightBrokenLinks(){
    brokenLinks.forEach(item => {
        let element = $("body a").filter(function() {
            return $(this).text() === item.innerText;
        });
        element.css('background-color', 'yellow');
        element.css('color', '#000');
    })
}

/**
 * Scroll to selected broken link
 * @param {object} brokenLink
 */
function scrollToBrokenLink(brokenLink){
    brokenLinks.forEach(item => {
        let element = $("body a").filter(function() {
            return $(this).text() === item.innerText;
        });
        element.css('border', '0px');
    })
    chrome.storage.local.set({'linkMarker_selectedBrokenLinks': brokenLink});
    selectedBrokenLink = brokenLink;

    let element = $("body a").filter(function() {
        return $(this).text() === brokenLink.innerText;
    });

    $([document.documentElement, document.body]).animate({
        scrollTop: element.offset().top - 300
    }, 2000);

    element.css('border', '1px solid red');
}

function highlightEmails(){
    let content = $('body').html();

    let emails = [];
    if (content && content != null && content != '') {
        emails.push(content.match(/(href=\"mailto:([^\"]*)\")/gi))
        emails.push(content.match(/(href=&quot;mailto:([^(&quot;)].*)&quot;)/gi))
    }

    emails.forEach(items => {
        if (items != null) {
            items.forEach(mailValue => {
                let hrefAttr = mailValue.slice(6).slice(0, -1);

                if (!hrefAttr.includes('var ')) {
                    $("a[href='"+hrefAttr+"']").css('background-color', 'orange');
                }
            })
        }
    })
}
