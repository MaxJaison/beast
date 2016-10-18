/**
 * Beast
 * @version 0.24.21
 * @homepage github.yandex-team.ru/kovchiy/beast
 */

'use strict';

;(function () {

if (typeof window !== 'undefined') {

    // Polyfill for window.CustomEvent in IE
    if (typeof window.CustomEvent !== 'function') {
        window.CustomEvent = function (event, params) {
            params = params || {bubbles: false, cancelable: false, detail: undefined}
            var e = document.createEvent('CustomEvent')
            e.initCustomEvent(event, params.bubbles, params.cancelable, params.detail)
            return e
        }
        window.CustomEvent.prototype = window.Event.prototype
    }

    window.Beast = {}
    document.addEventListener('DOMContentLoaded', function () {
        Beast.init()
    })

} else {
    global.Beast = {}
    module.exports = Beast
}

/*
 * Common vars
 */
var Declaration = {}                 // Declarations from Bease.decl()
var DeclarationFinished = false      // Flag turns true after the first Beast.node() call
var HttpRequestQueue = []            // Queue of required bml-files with link tag
var CssLinksToLoad = 0               // Num of <link rel="stylesheet"> in the <head>
var BeastIsReady = false             // If all styles and scripts are loaded
var OnBeastReadyCallbacks = []       // Functions to call when sources are ready
var ReStartBML = /<[a-z][^>]+\/?>/i  // matches start of BML substring
var ReDoubleQuote = /"/g             // matches "-symbols
var ReBackslash = /\\/g              // matches \-symbols
var ReLessThen = /</g                // matches <-symbols
var ReMoreThen = />/g                // matches >-symbols
var ReCamelCase = /([a-z])([A-Z])/g  // matches camelCase pairs
var ReStylePairSplit = /:\s?/        // matches :-separation in style DOM-attribute

// Declaration properties that can't belong to user
var ReservedDeclarationProperies = {
    inherits:1,
    expand:1,
    mod:1,
    mix:1,
    param:1,
    domInit:1,
    domAttr:1,
    on:1,
    onWin:1,
    onMod:1,
    tag:1,
    noElems:1,
    state:1,

    // 2 means not to inherit this field
    abstract:2,
    __userMethods:2,
    __commonExpand:2,
    __commonDomInit:2,
    __flattenInherits:2,
}

// CSS-properties measured in px commonly
var CssPxProperty = {
    height:1,
    width:1,
    left:1,
    right:1,
    bottom:1,
    top:1,
    'line-height':1,
    'font-size':1,
}

// Single HTML-tags
var SingleTag = {
    area:1,
    base:1,
    br:1,
    col:1,
    command:1,
    embed:1,
    hr:1,
    img:1,
    input:1,
    keygen:1,
    link:1,
    meta:1,
    param:1,
    source:1,
    wbr:1,
}

// Text output helpers
function escapeDoubleQuotes (string) {
    return string.replace(ReBackslash, '\\\\').replace(ReDoubleQuote, '\\"')
}
function escapeHtmlTags (string) {
    return string.replace(ReLessThen, '&lt;').replace(ReMoreThen, '&gt;')
}
function camelCaseToDash (string) {
    return string.replace(ReCamelCase, '$1-$2').toLowerCase()
}
function stringifyObject (ctx) {
    if (Array.isArray(ctx)) {
        var string = '['
        for (var i = 0, ii = ctx.length; i < ii; i++) {
            string += stringifyObject(ctx[i]) + ','
        }
        string = string.slice(0,-1)
        string += ']'
        return string
    }
    else if (typeof ctx === 'object') {
        var string = '{'
        for (var key in ctx) {
            if (ctx[key] !== undefined) {
                string += '"' + key + '":' + stringifyObject(ctx[key]) + ','
            }
        }
        string = string.slice(0,-1)
        string += '}'
        return string
    }
    else if (typeof ctx === 'string') {
        return '"' + escapeDoubleQuotes(ctx) + '"'
    }
    else if (typeof ctx === 'function' && ctx.beastDeclPath !== undefined) {
        return ctx.beastDeclPath
    }
    else {
        return ctx.toString()
    }
}
function objectIsEmpty (object) {
    for (var key in object) return false
    return true
}
function cloneObject (ctx) {
    if (Array.isArray(ctx)) {
        var array = []
        for (var i = 0, ii = ctx.length; i < ii; i++) {
            array.push(
                cloneObject(ctx[i])
            )
        }
        return array
    }
    else if (typeof ctx === 'object' && ctx) {
        var object = {}
        for (var key in ctx) {
            object[key] = cloneObject(ctx[key])
        }
        return object
    }
    else {
        return ctx
    }
}

/**
 * Public Beast properties
 */
Beast.declaration = Declaration

/**
 * Initialize Beast
 */
Beast.init = function () {
    var links = document.getElementsByTagName('link')
    var bmlLinks = []

    for (var i = 0, ii = links.length; i < ii; i++) {
        var link = links[i]
        if (link.type === 'bml' || link.rel === 'bml') {
            RequireModule(link.href)
            bmlLinks.push(link)
        }
        if (link.rel === 'stylesheet') {
            CssLinksToLoad++
            link.onload = link.onerror = function () {
                CheckIfBeastIsReady()
            }
        }
    }

    for (var i = 0, ii = bmlLinks.length; i < ii; i++) {
        bmlLinks[i].parentNode.removeChild(bmlLinks[i])
    }

    CheckIfBeastIsReady()
}

/**
 * Require declaration script
 *
 * @url string Path to script file
 */
function RequireModule (url) {
    var xhr = new (XMLHttpRequest || ActiveXObject)('MSXML2.XMLHTTP.3.0')
    xhr.open('GET', url)
    xhr.onreadystatechange = function () {
        if (this.readyState === 4 && this.status === 200) {
            CheckIfBeastIsReady()
        }
    }
    HttpRequestQueue.push(xhr)
    xhr.send()
}

/**
 * Checks if all <link> are loaded
 */
function CheckIfBeastIsReady () {
    if (BeastIsReady) return

    var isReady = true

    for (var i = 0, ii = HttpRequestQueue.length; i < ii; i++) {
        var xhr = HttpRequestQueue[i]
        if (xhr.readyState !== 4 || xhr.status !== 200) {
            isReady = false
        }
    }
    if (document.styleSheets.length < CssLinksToLoad) {
        isReady = false
    }

    if (isReady) {
        for (var i = 0, ii = HttpRequestQueue.length; i < ii; i++) {
            EvalBml(
                HttpRequestQueue[i].responseText
            )
        }
        HttpRequestQueue = []
        ProcessBmlScripts()

        BeastIsReady = true
        for (var i = 0, ii = OnBeastReadyCallbacks.length; i < ii; i++) {
            OnBeastReadyCallbacks[i]()
        }
    }
}

/**
 * Converts <script type="bml"/> tag to Beast::evalBml() method
 */
function ProcessBmlScripts () {
    var scripts = document.getElementsByTagName('script')

    for (var i = 0, ii = scripts.length; i < ii; i++) {
        var script = scripts[i]
        var text = script.text

        if (script.type === 'bml' && text !== '') {
            EvalBml(text)
        }
    }
}

/**
 * Parses and attaches declaration to <head>-node.
 * If there's only XML inside, appends node to document.body.
 *
 * @text string Text to parse and attach
 */
function EvalBml (text) {
    var parsedText = Beast.parseBML(text)
    if (/^[\s\n]*</.test(text)) {
        parsedText = parsedText + (
            document.body
                ? '.render(document.body)'
                : '.render(document.documentElement)'
        )
    }

    eval(parsedText)
}

/**
 * Initialize DOM: assign DOM-nodes to BemNodes
 * @domNode DOMElement Node to start with
 */
Beast.domInit = function (domNode, isInnerCall) {

    if (domNode === undefined) {
        return false
    }

    // ELEMENT_NODE
    else if (domNode.nodeType === 1) {
        var className = domNode.className

        if (className) {

            // Assign name
            var selector = className.split(' ')[0]
            var indexOf__ = selector.indexOf('__')
            var name

            if (indexOf__ === -1) {
                name = selector[0].toUpperCase() + selector.substr(1)
            } else {
                name = selector.substr(indexOf__ + 2)
            }

            var bemNode = Beast.node(name)

            // Assign attributes
            for (var i = 0, ii = domNode.attributes.length, name, value; i < ii; i++) {
                name = domNode.attributes[i].name
                value = domNode.attributes[i].value

                // Parse style to css object
                if (name === 'style') {
                    var stylePairs = value.split(';')
                    for (var j = 0, jj = stylePairs.length, stylePair; j < jj; j++) {
                        stylePair = stylePairs[j].split(ReStylePairSplit)
                        bemNode.css(stylePair[0], stylePair[1])
                    }
                }
                // Restore encoded objects
                else if (name === 'data-event-handlers') {
                    eval('bemNode._domNodeEventHandlers = ' + decodeURIComponent(value))
                }
                else if (name === 'data-mod-handlers') {
                    eval('bemNode._modHandlers = ' + decodeURIComponent(value))
                }
                else if (name === 'data-mod') {
                    eval('bemNode._mod = ' + decodeURIComponent(value))
                }
                else if (name === 'data-param') {
                    eval('bemNode._param = ' + decodeURIComponent(value))
                }
                else if (name === 'data-mix') {
                    eval('bemNode._mix = ' + decodeURIComponent(value))
                }
                else if (name === 'data-after-dom-init-handlers') {
                    eval('bemNode._afterDomInitHandlers = ' + decodeURIComponent(value))
                }
                else if (name === 'data-implemented-node-name') {
                    bemNode._implementedNode = Beast.node(value)
                }
                // Else _domAttr
                else if (name !== 'class') {
                    bemNode.domAttr(name, value)
                }
            }

            domNode.removeAttribute('data-event-handlers')
            domNode.removeAttribute('data-mod-handlers')
            domNode.removeAttribute('data-mod')
            domNode.removeAttribute('data-param')
            domNode.removeAttribute('data-mix')
            domNode.removeAttribute('data-after-dom-init-handlers')
            domNode.removeAttribute('data-implemented-node-name')

            // Assign children
            for (var i = 0, ii = domNode.childNodes.length, childNode; i < ii; i++) {
                childNode = Beast.domInit(domNode.childNodes[i], true)

                if (childNode instanceof BemNode) {
                    if (childNode._implementedNode) {
                        var childDomNode = childNode._domNode
                        childNode._domNode = undefined
                        bemNode.append(childNode._implementedNode)
                        childNode._implementedNode.implementWith(childNode, true)
                        childNode._domNode = childDomNode
                    } else {
                        bemNode.append(childNode)
                    }

                    childNode._renderedOnce = true
                } else {
                    bemNode.append(childNode)
                }
            }

            // Assign flags
            if (!isInnerCall) {
                bemNode._renderedOnce = true
            }
            bemNode._isExpanded = true

            // Crosslink
            bemNode._domNode = domNode
            domNode.bemNode = bemNode

            // Add event handlers
            if (bemNode._domNodeEventHandlers !== undefined) {
                for (var eventName in bemNode._domNodeEventHandlers) {
                    for (var i = 0, ii = bemNode._domNodeEventHandlers[eventName].length; i < ii; i++) {
                        bemNode.on(eventName, bemNode._domNodeEventHandlers[eventName][i], true, false, true)
                    }
                }
            }
            if (bemNode._windowEventHandlers !== undefined) {
                for (var eventName in bemNode._windowEventHandlers) {
                    for (var i = 0, ii = bemNode._windowEventHandlers[eventName].length; i < ii; i++) {
                        bemNode.onWin(eventName, bemNode._windowEventHandlers[eventName][i], true, false, true)
                    }
                }
            }

            // Call mod handlers
            for (var name in bemNode._mod) {
                bemNode._callModHandlers(name, bemNode._mod[name])
            }

            bemNode._domInit()

            return bemNode
        }
    }

    // TEXT_NODE
    else if (domNode.nodeType === 3) {
        return domNode.nodeValue
    }

    return false
}

/**
 * Declaration standart fields:
 * - inherits string|array Inherited declarations by selector
 * - expand   function     Expand instructions
 * - mod      object       Default modifiers
 * - noElems  object       If block can have elements
 * - param    object       Default parameters
 * - domInit  function     DOM inititial instructions
 * - on       object       Event handlers
 * - onWin    object       Window event hadnlers
 * - onMod    object       Modifier change actions
 * - tag      string       DOM tag name
 *
 * @selector string 'block' or 'block__elem'
 * @decl     object
 */
Beast.decl = function (selector, decl) {
    if (typeof selector === 'object') {
        for (var key in selector) Beast.decl(key, selector[key])
        return this
    } else {
        selector = selector.toLowerCase()
    }

    if (typeof decl.inherits === 'string') {
        decl.inherits = [decl.inherits]
    }

    if (typeof decl.mix === 'string') {
        decl.mix = [decl.mix]
    }

    if (decl.inherits) {
        for (var i = 0, ii = decl.inherits.length; i < ii; i++) {
            decl.inherits[i] = decl.inherits[i].toLowerCase()
        }
    }

    if (Declaration[selector] !== undefined) {
        var oldDecl = Declaration[selector]
        for (var item in oldDecl) {
            if (decl[item] === undefined) {
                decl[item] = oldDecl[item]
            }
        }
    }
    Declaration[selector] = decl

    return this
}

/**
 * Creates bemNode object
 *
 * @name    string         Node name
 * @attr    object         Node attributes
 * @content string|bemNode Last multiple argument
 * @return  BemNode
 */
Beast.node = function (name, attr) {
    // No more Beast.decl() after the first Beast.node() call
    if (!DeclarationFinished) {
        DeclarationFinished = true
        CompileDeclarations()
    }

    return new BemNode(
        name,
        attr,
        Array.prototype.splice.call(arguments, 2)
    )
}

/**
 * Compiles declaration fileds to methods, makes inheritances
 */
function CompileDeclarations () {
    function extend (obj, extObj) {
        for (var key in extObj) {
            if (ReservedDeclarationProperies[key] === 2) continue

            if (obj[key] === undefined) {
                obj[key] = extObj[key]
            }
            else if (typeof extObj[key] === 'function' && !obj[key]._inheritedDeclFunction) {
                (function (fn, inheritedFn, inheritedDecl) {
                    fn._inheritedDeclFunction = function () {
                        // Imitate inherited decl context for inner inherited() calls
                        var temp = this._decl
                        this._decl = inheritedDecl
                        inheritedFn.apply(this, arguments)
                        this._decl = temp
                    }
                })(obj[key], extObj[key], extObj)
            }
            else if (typeof extObj[key] === 'object' && !Array.isArray(extObj[key])) {
                extend(obj[key], extObj[key])
            }
        }
    }

    function compileCommonHandler (commonHandlerName, handlers, decl) {
        if (handlers.length === 0) return

        decl[commonHandlerName] = function () {
            for (var i = 0, ii = handlers.length; i < ii; i++) {
                handlers[i].call(this)
            }
        }
    }

    function inherit (decl, inheritedDecls, flattenInherits) {
        for (var i = inheritedDecls.length-1; i >= 0; i--) {
            var selector = inheritedDecls[i]
            var inheritedDecl = Declaration[selector]

            if (flattenInherits === undefined) {
                flattenInherits = []
            }
            flattenInherits.push(selector)

            if (inheritedDecl) {
                extend(decl, inheritedDecl)

                if (inheritedDecl.inherits) {
                    inherit(decl, inheritedDecl.inherits, flattenInherits)
                }
            }
        }

        return flattenInherits
    }

    for (var selector in Declaration) (function (decl) {

        // Extend decl with inherited rules
        if (decl.inherits) {
            var flattenInherits = inherit(decl, decl.inherits)
            decl.__flattenInherits = flattenInherits
        }

        // Compile expand rules to methods array
        var expandHandlers = []
        if (decl.expand) {
            expandHandlers.unshift(decl.expand)
        }
        if (decl.param) {
            expandHandlers.unshift(function () {
                this.defineParam(decl.param)
            })
        }
        if (decl.mod) {
            expandHandlers.unshift(function () {
                this.defineMod(decl.mod)
            })
        }
        if (decl.mix) {
            expandHandlers.unshift(function () {
                this.mix.apply(this, decl.mix)
            })
        }
        if (decl.tag) {
            expandHandlers.unshift(function () {
                this.tag(decl.tag)
            })
        }
        if (decl.noElems) {
            expandHandlers.unshift(function () {
                this.noElems()
            })
        }
        if (decl.domAttr) {
            expandHandlers.unshift(function () {
                this.domAttr(decl.domAttr)
            })
        }
        if (decl.onMod) {
            expandHandlers.unshift(function () {
                for (var modName in decl.onMod) {
                    for (var modValue in decl.onMod[modName]) {
                        this.onMod(modName, modValue, decl.onMod[modName][modValue], true)
                    }
                }
            })
        }
        if (decl.on) {
            expandHandlers.unshift(function () {
                for (var events in decl.on) {
                    this.on(events, decl.on[events], false, true)
                }
            })
        }
        if (decl.onWin) {
            expandHandlers.unshift(function () {
                for (var events in decl.onWin) {
                    this.onWin(events, decl.onWin[events], false, true)
                }
            })
        }

        // Compile domInit rules to methods array
        var domInitHandlers = []
        if (decl.domInit) {
            domInitHandlers.unshift(decl.domInit)
        }

        // Compile common handlers
        compileCommonHandler('__commonExpand', expandHandlers, decl)
        compileCommonHandler('__commonDomInit', domInitHandlers, decl)

        // Extract user methods
        decl.__userMethods = {}
        for (var key in decl) {
            if (ReservedDeclarationProperies[key] !== 1) {
                decl.__userMethods[key] = decl[key]
            }
        }

    })(Declaration[selector])
}

/**
 * Set callback when Beast is ready
 *
 * @callback function Function to call
 */
Beast.onReady = function (callback) {
    if (BeastIsReady) {
        callback()
    } else {
        OnBeastReadyCallbacks.push(callback)
    }
}

/**
 * Looks for '<foo><bar>...</bar></foo>'-substrings and replaces with js-equiualents.
 * Algorythm:
 * - Find XML-node in text
 * - First node in siquence is root
 * - If root is sinle then ParseBMLNode(root) and finish
 * - Else look for root is closing and there's no opening node
 *   with the same name behind the root
 * - When find whole XML-substring, split it by '<' and parse by element
 *
 * @text   string Text to parse
 * @return string Parsed text
 */
Beast.parseBML = function (text) {

    // Remove XML-comments
    var startCommentIndex
    var endCommentIndex
    do {
        startCommentIndex = text.indexOf('<!--')
        if (startCommentIndex === -1) break

        endCommentIndex = text.indexOf('-->')
        if (endCommentIndex === -1) break

        if (startCommentIndex < endCommentIndex) {
            text = text.substr(0,startCommentIndex) + text.substr(endCommentIndex + 3)
        } else {
            break
        }
    } while (true)

    // Replace XML-tags with JS-functions
    var startParams
    do {
        startParams = ReStartBML.exec(text)

        if (startParams === null) {
            return text
        }

        var matched = startParams[0]
        var bmlStartsAt = startParams.index
        var bmlEndsAt

        if (matched[matched.length-2] === '/') {
            bmlEndsAt = matched.length
        } else {
            var nameEndsAt = matched.indexOf('\n')
            if (nameEndsAt < 0) nameEndsAt = matched.indexOf(' ')
            if (nameEndsAt < 0) nameEndsAt = matched.length-1

            var name = matched.substr(1, nameEndsAt-1)
            var reOpenedNodesWithSameName = new RegExp('<'+ name +'(?:|[ \n][^>]*)>', 'g')
            var closedNode = '</'+ name +'>'
            var textPortion = text.substr(bmlStartsAt+1)
            var closedNodes = -1
            var openedNodes = 0
            var textBeforeClosedNode
            var textAfterClosedNode
            var indexOffset = 0

            do {
                bmlEndsAt = indexOffset === 0
                    ? textPortion.search(closedNode)
                    : textAfterClosedNode.search(closedNode) + indexOffset

                textBeforeClosedNode = textPortion.substr(0, bmlEndsAt)
                textAfterClosedNode = textPortion.substr(bmlEndsAt + 1)

                openedNodes = textBeforeClosedNode.match(reOpenedNodesWithSameName)
                openedNodes = openedNodes !== null ? openedNodes.length : 0

                closedNodes++
                indexOffset = bmlEndsAt + 1
            } while (
                openedNodes > closedNodes
            )

            bmlEndsAt += 1 + closedNode.length
        }

        var textPortion = text.substr(bmlStartsAt, bmlEndsAt)
        var textPortionReplace = ''
        var buffer = ''
        var splitBML = []
        var current
        var prev = ''
        var openBraceNum = 0

        for (var i = 0, ii = textPortion.length; i < ii; i++) {
            current = textPortion[i]

            if (current === '\n') {
                continue
            }

            if (current === '{' && prev !== '\\') {
                openBraceNum++
            }

            if (current === '}' && prev !== '\\') {
                openBraceNum--
            }

            if (current === '<' && openBraceNum === 0) {
                splitBML.push(buffer)
                buffer = ''
            }

            buffer += current

            if (current === '>' && openBraceNum === 0) {
                splitBML.push(buffer)
                buffer = ''
            }

            prev = current
        }

        if (buffer !== '') {
            splitBML.push(textPortion)
        }

        var first = true
        var inParentContext

        for (var i = 0, ii = splitBML.length; i < ii; i++) {
            var current = splitBML[i]

            if (current === '') continue

            var firstChar = current.substr(0,1)
            var firstTwoChars = current.substr(0,2)
            var lastChar = current.substr(current.length-1)
            var lastTwoChars = current.substr(current.length-2)

            if (firstTwoChars === '</' && lastChar === '>') {
                textPortionReplace += ')'
                continue
            }

            if (first) {
                first = false
                inParentContext = true
            } else {
                textPortionReplace += ', '
                inParentContext = false
            }

            if (firstChar === '<' && lastTwoChars === '/>') {
                textPortionReplace += ParseBMLNode(current, true, inParentContext)
                continue
            }

            if (firstChar === '<' && lastChar === '>') {
                textPortionReplace += ParseBMLNode(current, false, inParentContext)
                continue
            }

            if (firstChar === '<') {
                return console.error('Unclosed node:', current)
            }

            textPortionReplace += ParseTextInsideBML(current)
        }

        text = text.substr(0, bmlStartsAt) + textPortionReplace + text.substr(bmlStartsAt + bmlEndsAt)
    } while (true)
}

/**
 * Looks for '{...}'-substrings and replaces with js-concatinations.
 *
 * @text string Text to parse
 */
function ParseTextInsideBML (text) {
    var result = ''
    var openBraceNum = 0
    var prevSymbol = ''
    var symbol

    for (var i = 0, ii = text.length; i < ii; i++) {
        symbol = text[i]

        if (symbol === '{' && prevSymbol !== '\\') {
            openBraceNum++
            if (openBraceNum === 1) {
                if (result !== '') {
                    result += "',"
                }
            } else {
                result += symbol
            }
        } else if (openBraceNum > 0 && symbol === '}') {
            openBraceNum--
            if (openBraceNum === 0) {
                if (i < ii-1 && text[i+1] !== '{') {
                    result += ",'"
                }
            } else {
                result += symbol
            }
        } else if (openBraceNum === 0) {
            if (i === 0) result += "'"
            if (symbol === "'") result += '\\'
            result += symbol
            if (i === ii-1) result += "'"
        } else {
            result += symbol
        }

        prevSymbol = symbol
    }

    return result
}

/**
 * Converts '<foo>...</foo>' to 'Beast.node('foo', ...)'
 *
 * @text   string  Text to parse
 * @single boolean If node is sinle (<node/>)
 * @isRoot boolean If node is root of bml tree, it gets call-context of parent block
 * @return string  Javascript code
 */
function ParseBMLNode (text, single, isRoot) {
    text = text.substr(1)
    text = text.substr(
        0, text.length - (single ? 2 : 1)
    )

    var parsed = ParseNameAndAttrOfBMLNode(text)

    if (isRoot) {
        parsed.attr += (parsed.attr === '' ? '' : ',') + "'__context':this"
    }

    if (parsed.attr === '') {
        parsed.attr === 'undefined'
    }

    return "Beast.node('" + parsed.name + "',{" + parsed.attr + "}" + (single ? ')' : '')
}

/**
 * Parses XML-substring with node name and attributes to json string
 */
function ParseNameAndAttrOfBMLNode (text) {
    var nodeName
    var attr = ''
    var buffer = ''
    var openQuote = ''
    var attrName
    var escape = false

    for (var i = 0, ii = text.length-1; i <= ii; i++) {
        var s = text[i]

        // last symbol always metters
        if (i === ii && s !== ' ' && s !== '\n' && s !== "'" && s !== '"' && s !== '=') {
            buffer += s
        }

        // node name
        if ((s === ' ' || s === '\n' || i === ii) && nodeName === undefined) {
            nodeName = buffer
            buffer = ''
        }
        // boolean attr
        else if ((s === ' ' || s === '\n' || i === ii) && buffer !== '' && openQuote === '') {
            attr += "'"+ buffer +"':true,"
            buffer = ''
        }
        // attr name
        else if (s === '=' && openQuote === '') {
            attrName = buffer
            buffer = ''
        }
        // attr value start
        else if ((s === '"' || s === "'") && openQuote === '') {
            openQuote = s
        }
        // attr value finish
        else if (s === openQuote && !escape) {
            attr += "'"+ attrName +"':"+ (buffer === '' ? 'false' : ParseTextInsideBML(buffer)) + ","
            openQuote = ''
            buffer = ''
        }
        // when spaces metter
        else if ((s === ' ' || s === '\n') && openQuote !== '') {
            buffer += s
        }
        // read symbol
        else if (s !== ' ' && s !== '\n') {
            buffer += s
        }

        escape = s === '\\'
    }

    if (attr !== '') {
        attr = attr.substring(0, attr.length-1)
    }

    return {
        name: nodeName,
        attr: attr
    }
}

/**
 * Finds difference between @newNode and @oldNode and patches the DOM
 * @parentDomNode DomElement Node to fix children
 * @newNode       BemNode    Node after state change
 * @oldNode       BemNode    Node before state change
 * @index         number     Nodes common index
 */
Beast.patchDom = function (parentDomNode, newNode, oldNode, newIndex, oldIndex, oldParentNode) {
    if (newNode === undefined && oldNode === undefined) {
        return
    }
    if (newIndex === undefined) {
        newIndex = 0
    }
    if (oldIndex === undefined) {
        oldIndex = 0
    }

    // If newNode linked with oldNode -
    // move nodes to the end until newNode index equals to its DOM node index,
    // then if newNode and oldNode has any differences - continue children patching
    if (newNode !== undefined && newNode._domNode !== undefined) {
        var oldNodeReplacing
        while (newNode._domNode !== parentDomNode.childNodes[newIndex]) {
            oldNodeReplacing = oldParentNode._children[oldIndex]
            oldParentNode._children.splice(oldIndex, 1)
            oldParentNode._children.push(oldNodeReplacing)
            parentDomNode.appendChild(
                typeof oldNodeReplacing === 'string'
                    ? parentDomNode.childNodes[newIndex]
                    : oldNodeReplacing._domNode
            )
        }

        oldNodeReplacing = oldParentNode._children[oldIndex]

        if (oldNodeReplacing._linkedWithHashGlobal) {
            patchDomAttributes(newNode._domNode, newNode, oldNodeReplacing)
            patchDomEventHandlers(newNode._domNode, newNode, oldNodeReplacing)
            newNode._domInit()
            return
        } else {
            oldNode = oldNodeReplacing
        }
    }

    // If there's no oldNode or oldNode linked with other newNode -
    // create newNode DOM and decrement oldIndex
    else if (oldNode === undefined || oldNode !== undefined && oldNode._linkedNewNode !== undefined) {
        if (newNode instanceof BemNode) {
            newNode.render()
        } else {
            parentDomNode.appendChild(
                document.createTextNode(newNode)
            )
        }
        return true
    }

    // If there's no newNode -
    // remove the rest oldNodes DOM
    else if (newNode === undefined) {
        var oldNodeReplacing
        while (parentDomNode.childNodes[newIndex] !== undefined) {
            oldNodeReplacing = oldParentNode._children[oldIndex]

            if (oldNodeReplacing instanceof BemNode) {
                oldNodeReplacing.remove()
            } else {
                oldParentNode._children.splice(oldIndex, 1)
                parentDomNode.removeChild(
                    parentDomNode.childNodes[newIndex]
                )
            }
        }

        return false
    }

    // If DOM nodes of newNode and oldNode are incompatible -
    // remove oldNode DOM and create newNode DOM
    else if (
        typeof newNode !== typeof oldNode ||
        typeof newNode === 'string' && newNode !== oldNode ||
        newNode._tag !== oldNode._tag
    ) {
        if (newNode instanceof BemNode) {
            newNode.render()
            if (parentDomNode.childNodes[newIndex + 1] !== undefined) {
                parentDomNode.removeChild(
                    parentDomNode.childNodes[newIndex + 1]
                )
            }
        } else {
            parentDomNode.replaceChild(
                document.createTextNode(newNode),
                parentDomNode.childNodes[newIndex]
            )
        }

        return
    }

    // If newNode and oldNode are compatible -
    // patch them and go down to children
    if (newNode instanceof BemNode) {
        newNode._domNode = oldNode._domNode
        newNode._domNode.bemNode = newNode
        newNode._renderedOnce = true

        patchDomAttributes(newNode._domNode, newNode, oldNode)
        patchDomEventHandlers(newNode._domNode, newNode, oldNode)

        var newNodeChild
        var oldNodeChild
        var newNodeChildrenNum = newNode._children.length
        var oldNodeChildrenNum = oldNode._children.length

        // Link children with key
        for (var i = 0; i < newNodeChildrenNum; i++) {
            newNodeChild = newNode._children[i]

            if (typeof newNodeChild === 'string') {
                continue
            }

            for (var j = 0; j < oldNodeChildrenNum; j++) {
                oldNodeChild = oldNode._children[j]

                if (typeof oldNodeChild === 'string' || oldNodeChild._linkedWithHashGlobal) {
                    continue
                }

                if (
                    newNodeChild._hashGlobal === oldNodeChild._hashGlobal ||

                    newNodeChild._hashLocal === oldNodeChild._hashLocal &&
                    !oldNodeChild._linkedWithHashLocal &&
                    newNodeChild._domNode === undefined
                ) {
                    if (oldNodeChild._linkedNewNode !== undefined) {
                        oldNodeChild._linkedNewNode._domNode = undefined
                        oldNodeChild._linkedNewNode._renderedOnce = false
                    }

                    newNodeChild._domNode = oldNodeChild._domNode
                    newNodeChild._domNode.bemNode = newNodeChild
                    newNodeChild._renderedOnce = true

                    oldNodeChild._linkedNewNode = newNodeChild
                    oldNodeChild._linkedWithHashGlobal = newNodeChild._hashGlobal === oldNodeChild._hashGlobal
                    oldNodeChild._linkedWithHashLocal = true

                    if (oldNodeChild._linkedWithHashGlobal) {
                        break
                    }
                }
            }
        }

        // Patch children
        for (var i = 0, oldNodeIndexDec = 0, patchResult; i < newNodeChildrenNum || i < oldNodeChildrenNum + oldNodeIndexDec; i++) {
            patchResult = Beast.patchDom(
                newNode._domNode,
                newNode._children[i],
                oldNode._children[i - oldNodeIndexDec],
                i,
                i - oldNodeIndexDec,
                oldNode
            )

            if (patchResult === false) break
            if (patchResult === true) oldNodeIndexDec++
        }

        newNode._domInit()
    }
}

/**
 * Finds difference in DOM attributes and patches it
 * @domNode DomElement DOM node to fix attributes
 * @newNode BemNode    Node after state change
 * @oldNode BemNode    Node before state change
 */
function patchDomAttributes (domNode, newNode, oldNode) {

    // Compare DOM classes
    var newDomClasses = newNode._setDomNodeClasses(true)
    var oldDomClasses = oldNode._setDomNodeClasses(true)
    if (newDomClasses !== oldDomClasses) {
        domNode.className = newDomClasses
    }

    // Compare CSS properties
    var cssPropNames = keysFromObjects(newNode._css, oldNode._css)
    for (var i = 0, ii = cssPropNames.length, name; i < ii; i++) {
        name = cssPropNames[i]
        if (newNode._css[name] === undefined) {
            domNode.style[name] = ''
        }
        else if (newNode._css[name] !== oldNode._css[name]) {
            domNode.style[name] = newNode._css[name]
        }
    }

    // Compare DOM attributes
    var domAttrNames = keysFromObjects(newNode._domAttr, oldNode._domAttr)
    for (var i = 0, ii = domAttrNames.length, name; i < ii; i++) {
        name = domAttrNames[i]
        if (newNode._domAttr[name] === undefined) {
            domNode.removeAttribute(name)
        }
        else if (newNode._domAttr[name] !== oldNode._domAttr[name]) {
            domNode.setAttribute(name, newNode._domAttr[name])
        }
    }
}

/**
 * Finds difference in event handlers and patches it
 * @domNode DomElement DOM node to fix event handlers
 * @newNode BemNode    Node after state change
 * @oldNode BemNode    Node before state change
 */
function patchDomEventHandlers (domNode, newNode, oldNode) {
    var nodesAreDifferent = newNode._selector !== oldNode._selector

    // Remove previous handlers
    if (nodesAreDifferent || oldNode._hasExpandContextEventHandlers || oldNode._hasDomInitContextEventHandlers) {
        for (var eventName in oldNode._domNodeEventHandlers) {
            for (var i = 0, ii = oldNode._domNodeEventHandlers[eventName].length, eventHandler; i < ii; i++) {
                eventHandler = oldNode._domNodeEventHandlers[eventName][i]
                if (nodesAreDifferent || eventHandler.isExpandContext || eventHandler.isDomInitContext) {
                    domNode.removeEventListener(eventName, eventHandler)
                }
            }
        }
    }
    if (nodesAreDifferent || oldNode._hasExpandContextWindowEventHandlers || oldNode._hasDomInitContextWindowEventHandlers) {
        for (var eventName in oldNode._windowEventHandlers) {
            for (var i = 0, ii = oldNode._windowEventHandlers[eventName].length, eventHandler; i < ii; i++) {
                eventHandler = oldNode._windowEventHandlers[eventName][i]
                if (nodesAreDifferent || eventHandler.isExpandContext || eventHandler.isDomInitContext) {
                    window.removeEventListener(eventName, eventHandler)
                }
            }
        }
    }

    // Add new handlers
    if (nodesAreDifferent || newNode._hasExpandContextEventHandlers) {
        for (var eventName in newNode._domNodeEventHandlers) {
            for (var i = 0, ii = newNode._domNodeEventHandlers[eventName].length, eventHandler; i < ii; i++) {
                eventHandler = newNode._domNodeEventHandlers[eventName][i]
                if (nodesAreDifferent || eventHandler.isExpandContext) {
                    newNode.on(eventName, eventHandler, true, false, true)
                }
            }
        }
    }
    if (nodesAreDifferent || newNode._hasExpandContextWindowEventHandlers) {
        for (var eventName in newNode._windowEventHandlers) {
            for (var i = 0, ii = newNode._windowEventHandlers[eventName].length, eventHandler; i < ii; i++) {
                eventHandler = newNode._windowEventHandlers[eventName][i]
                if (nodesAreDifferent || eventHandler.isExpandContext) {
                    newNode.onWin(eventName, eventHandler, true, false, true)
                }
            }
        }
    }
}

/**
 * Extracts keys from object in @arguments
 * @return Array Array of keys
 */
function keysFromObjects () {
    var keys = []
    for (var i = 0, ii = arguments.length; i < ii; i++) {
        if (arguments[i] === undefined) {
            continue
        }
        for (var key in arguments[i]) {
            if (keys.indexOf(key) === -1) {
                keys.push(key)
            }
        }
    }
    return keys
}

/**
 * TODO
 */
function stringToHash (string) {
    if (string === '') return ''

    var hash = 0
    for (var i = 0, ii = string.length; i < ii; i++) {
        hash = ((hash << 5) - hash + string.charCodeAt(i)) | 0
    }
    return hash.toString()
}

/**
 * BEM node class
 *
 * @nodeName string Starts with capital for block else for elem
 * @attr     object List of attributes
 * @children array  Child nodes
 */
var BemNode = function (nodeName, attr, children) {
    this._selector = ''                     // BEM-name: 'block' or 'block__elem'
    this._nodeName = nodeName               // BML-node name
    this._attr = attr || {}                 // BML-node attributes
    this._isBlock = false                   // flag if node is block
    this._isElem = false                    // flag if node is elem
    this._mod = {}                          // modifiers list
    this._param = {}                        // parameters list
    this._state = undefined                 // reactive states
    this._domNode = undefined               // DOM-node reference
    this._domAttr = {}                      // DOM-attributes
    this._domNodeEventHandlers = undefined  // DOM event handlers
    this._windowEventHandlers = undefined   // window event handlers
    this._modHandlers = undefined           // handlers on modifiers change
    this._afterDomInitHandlers = []         // Handlers called after DOM-node inited
    this._domInited = false                 // Flag if DOM-node inited
    this._parentBlock = undefined           // parent block bemNode reference
    this._parentNode = undefined            // parent bemNode reference
    this._prevParentNode = undefined        // previous parent node value when parent node redefined
    this._children = []                     // list of children
    this._expandedChildren = undefined      // list of expanded children (for expand method purposes)
    this._isExpanded = false                // if Bem-node was expanded
    this._isExpandContext = false           // when flag is true append modifies expandedChildren
    this._isReplaceContext = false          // when flag is true append don't renders children's DOM
    this._isRenderStateContext = false      // when flag is true replaceWith don't call render
    this._isDomInitContext = false          // when flag is true inside domInit functions
    this._mix = []                          // list of additional CSS classes
    this._tag = 'div'                       // DOM-node name
    this._noElems = false                   // Flag if block can have children
    this._implementedNode = undefined       // Node wich this node implements
    this._css = {}                          // CSS properties
    this._cssClasses = undefined            // cached string of CSS classes
    this._decl = undefined                  // declaration for component
    this._flattenInherits = undefined       // array of flattened inherited declarations
    this._flattenInheritsForDom = undefined // array of inherited declarations to add as DOM-classes
    this._renderedOnce = false              // flag if component was rendered at least once
    this._elems = []                        // array of elements (for block only)
    this._hashGlobal = ''
    this._hashLocal = ''
    this._linkedNewNode = undefined

    // Define if block or elem
    var firstLetter = nodeName.substr(0,1)
    this._isBlock = firstLetter === firstLetter.toUpperCase()
    this._isElem = !this._isBlock

    // Define mods, params and special params
    for (var key in this._attr) {
        var firstLetter = key.substr(0,1)
        if (key === '__context') {
            if (this._parentBlock === undefined) {
                this.parentBlock(this._attr.__context)
            }
        } else if (firstLetter === firstLetter.toUpperCase()) {
            this._mod[key.toLowerCase()] = this._attr[key]
        } else if (key === 'tag') {
            this._tag = this._attr.tag
        } else {
            this._param[key.toLowerCase()] = this._attr[key]
        }
    }

    // Initial operations for block
    if (this._isBlock) {
        this._parentBlock = this
        this._defineDeclarationBySelector(nodeName.toLowerCase())
    }

    // Append children
    this.append.apply(this, children)
}

BemNode.prototype = {

    /**
     * Defines declaraion
     */
    _defineDeclarationBySelector: function (selector) {
        this._selector = selector
        this._decl = Declaration[this._selector]
        this._flattenInherits = this._decl && this._decl.__flattenInherits // in case of temporary _decl change

        if (this._decl && this._decl.state) {
            this._state = this._decl.state.call(this)
        }

        if (this._flattenInherits) {
            for (var i = 0, ii = this._flattenInherits.length, decl; i < ii; i++) {
                decl = Declaration[this._flattenInherits[i]]
                if (!decl || !decl.abstract) {
                    if (this._flattenInheritsForDom === undefined) {
                        this._flattenInheritsForDom = []
                    }
                    this._flattenInheritsForDom.push(this._flattenInherits[i])
                }
            }
        }

        this._defineUserMethods()
    },

    /**
     * Defines user's methods
     */
    _defineUserMethods: function (selector) {
        var decl = selector !== undefined ? Declaration[selector] : this._decl
        if (decl) {
            for (var methodName in decl.__userMethods) {
                this[methodName] = decl.__userMethods[methodName]
            }
        }
    },

    /**
     * Clears user's methods
     */
    _clearUserMethods: function () {
        if (this._selector === '' || !Declaration[this._selector]) return
        var userMethods = Declaration[this._selector].__userMethods
        for (var methodName in userMethods) {
            this[methodName] = undefined
        }
    },

    /**
     * Runs overwritten method's code
     *
     * @caller function ECMA6 claims caller function link
     */
    inherited: function (caller) {
        if (caller && caller._inheritedDeclFunction !== undefined) {
            caller._inheritedDeclFunction.apply(
                this,
                Array.prototype.splice.call(arguments, 1)
            )
        }

        return this
    },

    /**
     * Checks if component is @selctor was inherited from @selector
     *
     * @selector string
     * @return boolean
     */
    isKindOf: function (selector) {
        selector = selector.toLowerCase()
        var isKindOfSelector = this._selector === selector

        if (!isKindOfSelector && this._flattenInherits) {
            isKindOfSelector = this._flattenInherits.indexOf(selector) > -1
        }

        return isKindOfSelector
    },

    /**
     * If node is block
     *
     * @return boolean
     */
    isBlock: function () {
        return this._isBlock
    },

    /**
     * If node is element
     *
     * @return boolean
     */
    isElem: function () {
        return this._isElem
    },

    /**
     * Gets block or element name: 'block' or 'block__element'
     *
     * @return string
     */
    selector: function () {
        return this._selector
    },

    /**
     * Gets or sets node's tag name
     *
     * @return string
     */
    tag: function (tag) {
        if (tag === undefined) {
            return this._tag
        } else {
            if (!this._domNode) {
                this._tag = tag
            }
            return this
        }
    },

    /**
     * Sets css
     *
     * @name  string        css-property name
     * @value string|number css-property value
     */
    css: function (name, value) {
        if (typeof name === 'object') {
            for (var key in name) this.css(key, name[key])
        } else if (value === undefined) {
            if (this._domNode !== undefined && this._css[name] === undefined) {
                return window.getComputedStyle(this._domNode).getPropertyValue(name)
            } else {
                return this._css[name]
            }
        } else {
            if (typeof value === 'number' && CssPxProperty[name]) {
                value += 'px'
            }

            this._css[name] = value

            if (this._domNode) {
                this._setDomNodeCSS(name)
            }
        }

        return this
    },

    /**
     * Sets _noElems flag true
     */
    noElems: function () {
        this._noElems = true

        var parentOfParentBlock = this._parentBlock._parentNode
        while (parentOfParentBlock._noElems === true) {
            parentOfParentBlock = parentOfParentBlock._parentBlock._parentNode
        }
        this._setParentBlockForChildren(this, parentOfParentBlock)

        return this
    },

    /**
     * Only for elements. Gets or sets parent block bemNode reference.
     * Also sets bemNode name adding 'blockName__' before element name.
     * [@bemNode, [@dontAffectChildren]]
     *
     * @bemNode            object  Parent block node
     * @dontAffectChildren boolean If true, children won't get this parent block reference
     */
    parentBlock: function (bemNode, dontAffectChildren) {
        if (bemNode) {
            if (this._isElem
                && bemNode instanceof BemNode
                && bemNode !== this._parentBlock) {

                if (bemNode._parentBlock && bemNode._parentBlock._noElems) {
                    return this.parentBlock(bemNode._parentNode, dontAffectChildren)
                }

                this._clearUserMethods()
                this._removeFromParentBlockElems()
                this._parentBlock = bemNode._parentBlock
                this._addToParentBlockElems()
                this._defineDeclarationBySelector(
                    this._parentBlock._selector + '__' + this._nodeName.toLowerCase()
                )

                if (!dontAffectChildren) {
                    this._setParentBlockForChildren(this, bemNode)
                }
            }
            return this
        } else {
            return this._implementedNode
                ? this._implementedNode._parentBlock
                : this._parentBlock
        }
    },

    /**
     * Recursive parent block setting
     *
     * @bemNode     object current node with children
     * @parentBlock object paren block reference
     */
    _setParentBlockForChildren: function (bemNode, parentBlock) {
        for (var i = 0, ii = bemNode._children.length; i < ii; i++) {
            var child = bemNode._children[i]
            if (child instanceof BemNode && child._isElem) {
                child.parentBlock(parentBlock)
            }
        }
    },

    /**
     * Gets or sets parent bemNode reference
     * [@bemNode]
     *
     * @bemNode object parent node
     */
    parentNode: function (bemNode) {
        if (bemNode !== undefined) {
            if (this._renderedOnce) {
                this.detach()
            }
            if (bemNode !== this._parentNode) {
                this._prevParentNode = this._parentNode
                this._parentNode = bemNode
            }
            return this
        } else {
            return this._parentNode
        }
    },

    /**
     * Gets DOM-node reference
     */
    domNode: function () {
        return this._domNode
    },

    /**
     * Set or get dom attr
     * @name, [@value]
     *
     * @name  string Attribute name
     * @value string Attribute value
     */
    domAttr: function (name, value, domOnly) {
        if (typeof name === 'object') {
            for (var key in name) this.domAttr(key, name[key])
        } else if (value === undefined) {
            return this._domNode === undefined ? this._domAttr[name] : this._domNode[name]
        } else {
            if (!domOnly) {
                this._domAttr[name] = value
            }
            if (this._domNode) {
                if (value === false || value === '') {
                    this._domNode.removeAttribute(name)
                } else {
                    this._domNode.setAttribute(name, value)
                }
            }
        }

        return this
    },

    /**
     * Set additional classes
     */
    mix: function () {
        for (var i = 0, ii = arguments.length; i < ii; i++) {
            this._mix.push(arguments[i])
        }
        if (this._domNode) {
            this._setDomNodeClasses()
        }

        this._cssClasses = undefined
        return this
    },

    /**
     * Define modifiers and its default values
     */
    defineMod: function (defaults) {
        if (this._implementedNode) {
            this._implementedNode._extendProperty('_mod', defaults)
        }
        return this._extendProperty('_mod', defaults)
    },

    /**
     * Exntends object property with default object
     *
     * @propertyName string
     * @defaults     object
     */
    _extendProperty: function (propertyName, defaults)
    {
        var actuals = this[propertyName]
        var lowerCaseKey

        for (var key in defaults) {
            lowerCaseKey = key.toLowerCase()
            if (actuals[lowerCaseKey] === undefined || actuals[lowerCaseKey] === '') {
                actuals[lowerCaseKey] = defaults[key]
            }
        }

        return this
    },

    /**
     * Define parameters and its default values
     */
    defineParam: function (defaults) {
        return this._extendProperty('_param', defaults)
    },

    /**
     * Sets or gets mod
     * @name, [@value, [@data]]
     *
     * @name  string         Modifier name
     * @value string|boolean Modifier value
     * @data  anything       Additional data
     */
    mod: function (name, value, data) {
        if (name === undefined) {
            return this._mod
        } else if (typeof name === 'string') {
            name = name.toLowerCase()
        } else {
            for (var key in name) this.mod(key, name[key])
            return this
        }

        if (value === undefined) {
            return this._mod[name]
        } else if (this._mod[name] !== value) {
            this._cssClasses = undefined
            this._mod[name] = value
            if (this._implementedNode) {
                this._implementedNode._mod[name] = value
            }
            if (this._domNode) {
                this._setDomNodeClasses()
                this._callModHandlers(name, value, data)
            }
        }

        return this
    },

    /**
     * Sets or gets state
     * @name, [@value]
     *
     * @name  string   State name
     * @value anything Modifier value
     */
    state: function (name, value, recursiveCall) {
        if (name === undefined) {
            return this._state
        } else if (typeof name === 'string') {
            name = name.toLowerCase()
        } else {
            for (var key in name) this.state(key, name[key], true)
            this.renderState()
            return this
        }

        if (value === undefined) {
            return this._state[name]
        } else if (this._state[name] !== value) {
            if (this._isExpandContext) {
                console.error('Change state in expand context is not allowed:', name, value)
            } else {
                this._state[name] = value
                if (!recursiveCall) {
                    this.renderState()
                }
            }
        }

        return this
    },

    /**
     * Toggles mods.
     *
     * @name   string         Modifier name
     * @value1 string|boolean Modifier value 1
     * @value2 string|boolean Modifier value 2
     */
    toggleMod: function (name, value1, value2) {
        if (!this.mod(name) || this.mod(name) === value2) {
            this.mod(name, value1)
        } else {
            this.mod(name, value2)
        }

        return this
    },

    /**
     * Sets or gets parameter.
     * @name, [@value]
     *
     * @name  string
     * @value anything
     */
    param: function (name, value) {
        if (name === undefined) {
            return this._param
        } else if (typeof name === 'string') {
            name = name.toLowerCase()
        } else {
            for (var key in name) this.param(key, name[key])
            return this
        }

        if (value === undefined) {
            return this._param[name]
        } else {
            this._param[name] = value
        }

        return this
    },

    /**
     * Sets events handler
     *
     * @events  string   Space splitted event list: 'click' or 'click keypress'
     * @handler function
     */
    on: function (event, handler, isSingleEvent, fromDecl, dontCache) {
        if (typeof handler !== 'function') {
            return this
        }

        if (!handler.isBoundToNode) {
            var handlerOrigin = handler
            handler = function (e) {
                handlerOrigin.call(this, e, e.detail)
            }.bind(this)
            handler.isBoundToNode = true
        }

        if (!isSingleEvent && event.indexOf(' ') > -1) {
            var events = event.split(' ')
            for (var i = 0, ii = events.length; i < ii; i++) {
                this.on(events[i], handler, true)
            }
        } else {
            if (this._domNode !== undefined) {
                this._domNode.addEventListener(event, handler)
            }

            if (!dontCache) {
                if (this._domNodeEventHandlers === undefined) {
                    this._domNodeEventHandlers = {}
                }
                if (this._domNodeEventHandlers[event] === undefined) {
                    this._domNodeEventHandlers[event] = []
                }
                this._domNodeEventHandlers[event].push(handler)
            }

            if (this._isExpandContext && !fromDecl) {
                handler.isExpandContext = true
                this._hasExpandContextEventHandlers = true
            }
            if (this._isDomInitContext) {
                handler.isDomInitContext = true
                this._hasDomInitContextEventHandlers = true
            }
        }

        return this
    },

    /**
     * Sets modifier change handler
     *
     * @modName  string
     * @modValue string|boolean
     * @handler  function
     */
    onWin: function (event, handler, isSingleEvent, fromDecl, dontCache) {
        if (typeof handler !== 'function') {
            return this
        }

        if (!handler.isBoundToNode) {
            var handlerOrigin = handler
            handler = function (e) {
                handlerOrigin.call(this, e, e.detail)
            }.bind(this)
            handler.isBoundToNode = true
        }

        if (!isSingleEvent && event.indexOf(' ') > -1) {
            var events = event.split(' ')
            for (var i = 0, ii = events.length; i < ii; i++) {
                this.onWin(events[i], handler, true)
            }
        } else {
            if (this._domNode !== undefined) {
                window.addEventListener(event, handler)
            }

            if (!dontCache) {
                if (this._windowEventHandlers === undefined) {
                    this._windowEventHandlers = {}
                }
                if (this._windowEventHandlers[event] === undefined) {
                    this._windowEventHandlers[event] = []
                }
                this._windowEventHandlers[event].push(handler)
            }

            if (this._isExpandContext && !fromDecl) {
                handler.isExpandContext = true
                this._hasExpandContextWindowEventHandlers = true
            }
            if (this._isDomInitContext) {
                handler.isDomInitContext = true
                this._hasDomInitContextWindowEventHandlers = true
            }
        }

        return this
    },

    /**
     * Sets modifier change handler
     *
     * @modName  string
     * @modValue string|boolean
     * @handler  function
     * @fromDecl boolean Private param for cache
     */
    onMod: function (modName, modValue, handler, fromDecl) {

        if (this._isExpandContext && !fromDecl) {
            handler.isExpandContext = true
            this._hasExpandContextModHandlers = true
        }

        // Used in toHtml() method to restore function links
        if (fromDecl) {
            handler.beastDeclPath = 'Beast.declaration["' + this._selector + '"].onMod["' + modName + '"]["' + modValue + '"]'
        }

        modName = modName.toLowerCase()

        if (this._modHandlers === undefined) {
            this._modHandlers = {}
        }
        if (this._modHandlers[modName] === undefined) {
            this._modHandlers[modName] = {}
        }
        if (this._modHandlers[modName][modValue] === undefined) {
            this._modHandlers[modName][modValue] = []
        }
        this._modHandlers[modName][modValue].push(handler)

        return this
    },

    /**
     * Triggers event
     *
     * @eventName string
     * @data      anything Additional data
     */
    trigger: function (eventName, data) {
        if (this._domNode) {
            this._domNode.dispatchEvent(
                data
                    ? new CustomEvent(eventName, {detail:data})
                    : new Event(eventName)
            )
        }

        return this
    },

    /**
     * Triggers window event
     *
     * @eventName string
     * @data      anything Additional data
     */
    triggerWin: function (eventName, data) {
        if (this._domNode) {
            eventName = this.parentBlock()._nodeName + ':' + eventName
            window.dispatchEvent(
                data
                    ? new CustomEvent(eventName, {detail:data})
                    : new Event(eventName)
            )
        }

        return this
    },

    /**
     * Gets current node index among siblings
     *
     * @return number
     */
    index: function (allowStrings) {
        var siblings = this._parentNode._children
        var dec = 0
        for (var i = 0, ii = siblings.length; i < ii; i++) {
            if (typeof siblings[i] === 'string') dec++
            if (siblings[i] === this) return allowStrings ? i : i - dec
        }
    },

    /**
     * Empties children
     */
    empty: function () {
        var children

        if (this._isExpandContext) {
            children = this._expandedChildren
            this._expandedChildren = []
        } else {
            children = this._children
            this._children = []
        }

        if (children) {
            for (var i = 0, ii = children.length; i < ii; i++) {
                if (children[i] instanceof BemNode) {
                    children[i].remove()
                }
            }
        }

        if (this._domNode) {
            // Child text nodes could be left
            while (this._domNode.firstChild) {
                this._domNode.removeChild(this._domNode.firstChild)
            }
        }

        return this
    },

    /**
     * Removes itself from parent block elems array
     */
    _removeFromParentBlockElems: function () {
        var parentBlock

        if (this._isElem) {
            parentBlock = this._parentBlock
        } else if (this._isBlock && this._implementedNode) {
            parentBlock = this._implementedNode._parentBlock
        }

        if (parentBlock) {
            for (var i = 0, ii = this._parentBlock._elems.length; i < ii; i++) {
                if (this._parentBlock._elems[i] === this) {
                    this._parentBlock._elems.splice(i, 1)
                    break
                }
            }
        }
    },

    /**
     * Adds itself to parent block elems array
     */
    _addToParentBlockElems: function () {
        var parentBlock

        if (this._isElem) {
            parentBlock = this._parentBlock
        } else if (this._isBlock && this._implementedNode) {
            parentBlock = this._implementedNode._parentBlock
        }

        if (parentBlock) {
            parentBlock._elems.push(this)
        }
    },

    /**
     * Removes itself
     */
    remove: function () {

        // Proper remove children
        for (var i = 0, ii = this._children.length; i < ii; i++) {
            if (this._children[i] instanceof BemNode) {
                this._children[i].remove()
                i--
            }
        }

        // Remove window handlers
        if (this._windowEventHandlers !== undefined) {
            for (var eventName in this._windowEventHandlers) {
                for (var i = 0, ii = this._windowEventHandlers[eventName].length; i < ii; i++) {
                    window.removeEventListener(
                        eventName, this._windowEventHandlers[eventName][i]
                    )
                }
            }
        }

        this.detach()
    },

    /**
     * Detaches itself
     */
    detach: function () {

        // Remove DOM node
        if (this._domNode && this._domNode.parentNode) {
            this._domNode.parentNode.removeChild(this._domNode)
        }

        // Remove from parentNode's children
        if (this._parentNode) {
            this._parentNode._children.splice(
                this._parentNode._children.indexOf(this), 1
            )
            this._parentNode = undefined
        }

        this._removeFromParentBlockElems()

        return this
    },

    /**
     * Inserts new children by index. If there's no DOM yet,
     * appends to expandedChildren else appends to children
     * and renders its DOM.
     *
     * @children string|object Children to insert
     * @index    number        Index to insert
     */
    insertChild: function (children, index) {
        for (var i = 0, ii = children.length; i < ii; i++) {
            var child = children[i]

            if (child === false || child === null || child === undefined) {
                continue
            } else if (Array.isArray(child)) {
                this.insertChild(child, index)
                continue
            } else if (child instanceof BemNode) {
                child.parentNode(this)
                if (child._isElem) {
                    if (this._isBlock) {
                        child.parentBlock(this)
                    } else if (this._parentBlock !== undefined) {
                        child.parentBlock(this._parentBlock)
                    }
                }
            } else if (typeof child === 'number') {
                child = child.toString()
            }

            var childrenToChange = this._children

            if (this._isExpandContext) {
                if (this._expandedChildren === undefined) {
                    this._expandedChildren = []
                }
                childrenToChange = this._expandedChildren
            }

            if (index === 0) {
                childrenToChange.unshift(child)
            } else if (index === -1) {
                childrenToChange.push(child)
            } else {
                childrenToChange.splice(index, 0, child)
            }

            if (this._domNode && !this._isReplaceContext) {
                this._renderChildWithIndex(
                    index === -1 ? childrenToChange.length - 1 : index
                )
            }
        }

        return this
    },

    /**
     * Appends new children. If there's no DOM yet,
     * appends to expandedChildren else appends to children
     * and renders its DOM.
     *
     * @children string|object Multiple argument
     */
    append: function () {
        return this.insertChild(arguments, -1)
    },

    /**
     * Prepends new children. If there's no DOM yet,
     * appends to expandedChildren else appends to children
     * and renders its DOM.
     *
     * @children string|object Multiple argument
     */
    prepend: function () {
        return this.insertChild(arguments, 0)
    },

    /**
     * Appends node to the target. If current node belongs to another parent,
     * method removes it from the old context.
     *
     * @bemNode object Target
     */
    appendTo: function (bemNode) {
        bemNode.append(this)
        return this
    },

    /**
     * Prepends node to the target. If current node belongs to another parent,
     * method removes it from the old context.
     *
     * @bemNode object Target
     */
    prependTo: function (bemNode) {
        bemNode.prepend(this)
        return this
    },

    /**
     * Replaces current bemNode with the new
     * @bemNode   BemNode Node that replaces
     * @ignoreDom boolean Private flag - do not change DOM; used in toHtml() method
     */
    replaceWith: function (bemNode, ignoreDom) {
        this._completeExpand()

        var parentNode = this._parentNode
        var siblingsAfter

        if (parentNode) {
            if (parentNode === bemNode) {
                parentNode = this._prevParentNode
            } else {
                siblingsAfter = parentNode._children.splice(this.index(true))
                siblingsAfter.shift()
            }
            parentNode._isReplaceContext = true
            parentNode.append(bemNode)
            parentNode._isReplaceContext = false
        }

        if (siblingsAfter) {
            parentNode._children = parentNode._children.concat(siblingsAfter)
        }

        this._parentNode = undefined

        if (bemNode instanceof BemNode) {
            if (bemNode._isBlock) {
                bemNode._resetParentBlockForChildren()
            }
            if (this._isRenderStateContext) {
                bemNode._expandForRenderState(true)
            } else if (!ignoreDom) {
                bemNode.render()
            }
        }
    },

    /**
     * Recursive setting parentBlock as this for child elements
     */
    _resetParentBlockForChildren: function () {
        for (var i = 0, ii = this._children.length; i < ii; i++) {
            var child = this._children[i]
            if (child instanceof BemNode && child._isElem) {
                child.parentBlock(this._parentBlock)
                child._resetParentBlockForChildren(this._parentBlock)
            }
        }
    },

    /**
     * Replaces current bemNode with the new wich implemets its declaration
     * @bemNode   BemNode Node that implements
     * @ignoreDom boolean Private flag - do not change DOM; used in toHtml() method
     */
    implementWith: function (bemNode, ignoreDom) {
        this._cssClasses = undefined

        if (this._domNodeEventHandlers !== undefined) {
            bemNode._domNodeEventHandlers = bemNode._domNodeEventHandlers === undefined
                ? this._domNodeEventHandlers
                : bemNode._domNodeEventHandlers.concat(this._domNodeEventHandlers)
        }

        if (this._windowEventHandlers !== undefined) {
            bemNode._windowEventHandlers = bemNode._windowEventHandlers === undefined
                ? this._windowEventHandlers
                : bemNode._windowEventHandlers.concat(this._windowEventHandlers)
        }

        this._setDomNodeClasses()
        bemNode._implementedNode = this
        this._implementedWith = bemNode
        bemNode._extendProperty('_mod', this._mod)
        bemNode._extendProperty('_param', this._param)
        this._extendProperty('_mod', bemNode._mod)
        bemNode._defineUserMethods(this._selector)
        this.replaceWith(bemNode, ignoreDom)
        this._removeFromParentBlockElems()
        bemNode._addToParentBlockElems()
    },

    /**
     * Filters text in children
     *
     * @return string
     */
    text: function () {
        var text = ''
        for (var i = 0, ii = this._children.length; i < ii; i++) {
            if (typeof this._children[i] === 'string') {
                text += this._children[i]
            }
        }

        return text
    },

    /**
     * Gets elements by name
     */
    elem: function () {
        if (this._isElem) {
            return this.elem.apply(this._parentBlock, arguments)
        }

        if (arguments.length === 0) {
            return this._elems
        }

        var elems = []
        for (var i = 0, ii = this._elems.length, elem; i < ii; i++) {
            elem = this._elems[i]
            for (var j = 0, jj = arguments.length, elemName; j < jj; j++) {
                elemName = arguments[j]
                if (elem._nodeName === elemName ||
                    elem._implementedNode && elem._implementedNode._nodeName === elemName
                ) {
                    elems.push(elem)
                }
            }
        }

        return elems
    },

    /**
     * Finds bemNodes and attributes by paths:
     * - nodeName1 (children)
     * - nodeName1/ (all children of children)
     * - nodeName1/nodeName2 (children of children)
     * - ../nodeName1 (children of parent)
     *
     * @path   string Multiple argument: path to node or attribute
     * @return array  bemNodes collection
     */
    get: function () {
        if (arguments.length === 0) return this._children

        var collections = []

        for (var i = 0, ii = arguments.length, collection; i < ii; i++) {
            if (arguments[i] === '/') {
                collection = this._filterChildNodes('')
            } else {
                var pathItems = arguments[i].split('/')

                for (var j = 0, jj = pathItems.length; j < jj; j++) {
                    var pathItem = pathItems[j]

                    if (j === 0) {
                        collection = this._filterChildNodes(pathItem)
                    } else {
                        var prevCollection = collection
                        collection = []
                        for (var k = 0, kk = prevCollection.length; k < kk; k++) {
                            collection = collection.concat(
                                this._filterChildNodes.call(prevCollection[k], pathItem)
                            )
                        }
                    }

                    if (collection.length === 0) {
                        break
                    }
                }
            }

            if (ii === 1) {
                collections = collection
            } else {
                collections = collections.concat(collection)
            }
        }

        return collections
    },

    /**
     * Collects children by node name
     *
     * @name   string Child node name
     * @return array  Filtered children
     */
    _filterChildNodes: function (name) {
        if (name === '..') {
            return [this._parentNode]
        }

        var collection = []
        for (var i = 0, ii = this._children.length; i < ii; i++) {
            var child = this._children[i]
            if (
                child instanceof BemNode && (
                    name === ''
                    || name === child._nodeName
                    || child._implementedNode && name === child._implementedNode._nodeName
                )
            ) {
                collection.push(child)
            }
        }

        return collection
    },

    /**
     * Checks if there are any children
     *
     * @path string Multiple argument: path to node or attribute
     */
    has: function () {
        return this.get.apply(this, arguments).length > 0
    },

    /**
     * Set handler to call afted DOM-node inited
     *
     * @callback function Handler to call
     */
    afterDomInit: function (handler) {
        if (!this._domInited) {
            this._afterDomInitHandlers.push(handler)
        } else {
            handler.call(this)
        }

        return this
    },

    /**
     * Clones itself
     */
    clone: function (parentNodeOfClone) {
        var clone = {}
        clone.__proto__ = this.__proto__

        for (var key in this) {
            if (key === '_children') {
                var cloneChildren = []
                for (var i = 0, ii = this._children.length; i < ii; i++) {
                    cloneChildren.push(
                        this._children[i] instanceof BemNode
                            ? this._children[i].clone(clone)
                            : this._children[i]
                    )
                }
                clone._children = cloneChildren
            } else {
                clone[key] = this[key]
            }
        }

        if (parentNodeOfClone !== undefined) {
            clone._parentNode = parentNodeOfClone
        }

        return clone
    },

    /**
     * Expands bemNode. Creates DOM-node and appends to the parent bemNode's DOM.
     * Also renders its children. Inits DOM declarations at the end.
     *
     * @parentDOMNode object Parent for the root node attaching
     */
    render: function (parentDOMNode) {

        // Call expand handler
        if (!this._isExpanded && this._decl && this._decl.__commonExpand) {
            this._isExpandContext = true
            this._decl.__commonExpand.call(this)
            this._completeExpand()
            this._isExpandContext = false
        }

        // Continue only if parent node is defined
        if (!parentDOMNode && !this._parentNode) {
            return this
        }

        // Create DOM element if there isn't
        if (!this._domNode) {
            this._domNode = document.createElement(this._tag)
            this._domNode.bemNode = this

            this._setDomNodeClasses()
            this._setDomNodeCSS()

            for (var key in this._domAttr) {
                this.domAttr(key, this._domAttr[key], true)
            }
        }

        // Append to DOM tree
        if (parentDOMNode) {
            parentDOMNode.appendChild(this._domNode)
        } else {
            this._parentNode._domNode.insertBefore(
                this._domNode,
                this._parentNode._domNode.childNodes[
                    this.index(true)
                ] || null
            )
        }

        // When first time render
        if (!this._renderedOnce) {

            // Render children
            for (var i = 0, ii = this._children.length; i < ii; i++) {
                this._renderChildWithIndex(i)
            }

            // For HTML-body remove previous body tag
            if (this._tag === 'body') {
                document.documentElement.replaceChild(this._domNode, document.body)
            }

            // Add event handlers
            if (this._domNodeEventHandlers !== undefined) {
                for (var eventName in this._domNodeEventHandlers) {
                    for (var i = 0, ii = this._domNodeEventHandlers[eventName].length; i < ii; i++) {
                        this.on(eventName, this._domNodeEventHandlers[eventName][i], true, false, true)
                    }
                }
            }
            if (this._windowEventHandlers !== undefined) {
                for (var eventName in this._windowEventHandlers) {
                    for (var i = 0, ii = this._windowEventHandlers[eventName].length; i < ii; i++) {
                        this.onWin(eventName, this._windowEventHandlers[eventName][i], true, false, true)
                    }
                }
            }

            // Call mod handlers
            for (var modName in this._mod) {
                this._callModHandlers(modName, this._mod[modName])
            }

            // Call DOM init handlers
            this._domInit()

            // Compontent rendered at least once
            this._renderedOnce = true
        }

        return this
    },

    /**
     * Creates DOM-node for child with @index and appends to DOM tree
     *
     * @index number Child index
     */
    _renderChildWithIndex: function (index) {
        var child = this._children[index]

        if (child instanceof BemNode) {
            child.render()
        } else {
            this._domNode.insertBefore(
                document.createTextNode(child),
                this._domNode.childNodes[index] || null
            )
        }
    },

    /**
     * Change children array to expanded children array
     * after node expanding
     */
    _completeExpand: function () {
        if (this._isExpandContext && this._expandedChildren) {
            this._children = this._expandedChildren
            this._expandedChildren = undefined
        }
        this._isExpanded = true
    },

    /**
     * Calcs hash ID for Beast.patchDom algo
     */
    _updateHash: function () {
        var string = this._tag + ' class="' + this._setDomNodeClasses(true) + '"'

        // for (var attrName in this._domAttr) {
        //     string += ' ' + attrName + '="' + this._domAttr[attrName] + '"'
        // }

        // for (var propName in this._css) {
        //     string += ' ' + propName + ':' + this._css[propName]
        // }

        this._hashLocal = stringToHash(string)

        for (var i = 0, ii = this._children.length; i < ii; i++) {
            if (typeof this._children[i] === 'string') {
                string += this._children[i]
            } else {
                this._children[i]._updateHash()
                string += this._children[i]._hashGlobal
            }
        }

        this._hashGlobal = stringToHash(string)
    },

    /**
     * Initial instructions for the DOM-element
     */
    _domInit: function () {
        this._isDomInitContext = true

        var decl = this._decl
        if (decl) {
            decl.__commonDomInit && decl.__commonDomInit.call(this)
        }

        if (this._implementedNode && (decl = this._implementedNode._decl)) {
            decl.__commonDomInit && decl.__commonDomInit.call(this)
        }

        this._isDomInitContext = false
        this._domInited = true

        if (this._afterDomInitHandlers.length !== 0) {
            for (var i = 0, ii = this._afterDomInitHandlers.length; i < ii; i++) {
                this._afterDomInitHandlers[i].call(this)
            }
        }
    },

    /**
     * Call modifier change handlers
     *
     * @modName  string
     * @modValue string
     * @data     object Additional data for handler
     */
    _callModHandlers: function (modName, modValue, data, context) {
        var handlers

        if (this._modHandlers !== undefined && this._modHandlers[modName]) {
            if (this._modHandlers[modName][modValue]) {
                handlers = this._modHandlers[modName][modValue]
            } else if (modValue === false && this._modHandlers[modName]['']) {
                handlers = this._modHandlers[modName]['']
            } else if (modValue === '' && this._modHandlers[modName][false]) {
                handlers = this._modHandlers[modName][false]
            }
            if (this._modHandlers[modName]['*']) {
                if (handlers) {
                    handlers = handlers.concat(this._modHandlers[modName]['*'])
                } else {
                    handlers = this._modHandlers[modName]['*']
                }
            }
        }

        if (handlers) {
            if (context === undefined) context = this
            for (var i = 0, ii = handlers.length; i < ii; i++) {
                handlers[i].call(context, data)
            }
        }

        if (this._implementedNode) {
            this._implementedNode._callModHandlers(modName, modValue, data, this)
        }
    },

    /**
     * Sets DOM classes
     */
    _setDomNodeClasses: function (returnClassNameOnly) {
        if (this._cssClasses === undefined) {
            var className = this._selector
            var value
            var tail

            if (this._flattenInheritsForDom) {
                for (var i = 0, ii = this._flattenInheritsForDom.length; i < ii; i++) {
                    className += ' ' + this._flattenInheritsForDom[i]
                }
            }

            if (this._mix.length !== 0) {
                for (var i = 0, ii = this._mix.length; i < ii; i++) {
                    className += ' ' + this._mix[i]
                }
            }

            for (var key in this._mod) {
                value = this._mod[key]
                if (value === '' || value === false) continue

                tail = value === true
                    ? '_' + key
                    : '_' + key + '_' + value

                className += ' ' + this._selector + tail

                if (this._flattenInheritsForDom) {
                    for (var i = 0, ii = this._flattenInheritsForDom.length; i < ii; i++) {
                        className += ' ' + this._flattenInheritsForDom[i] + tail
                    }
                }
            }

            if (this._implementedNode) {
                className += ' ' + this._implementedNode._setDomNodeClasses(true)
            }

            this._cssClasses = className
        }

        if (returnClassNameOnly) {
            return this._cssClasses
        } else {
            if (this._domNode) {
                this._assignDomClasses.call(this)
            }
        }
    },

    _assignDomClasses: function () {
        this._domNode.className = this._cssClasses
    },

    /**
     * Sets DOM CSS
     */
    _setDomNodeCSS: function (propertyToChange, isAnimationFrame) {
        if (isAnimationFrame) {
            for (var name in this._css) {
                if (propertyToChange !== undefined && propertyToChange !== name) {
                    continue
                }
                if (this._css[name] || this._css[name] === 0 || this._css[name] === '') {
                    this._domNode.style[name] = this._css[name]
                }
            }
        } else {
            this._setDomNodeCSS.call(this, propertyToChange, true)
        }
    },

    /**
     * Conerts BemNode with its children to string of Beast.node() functions
     * @return string
     */
    toStringOfFunctions: function () {
        var attr = '{'
        for (var key in this._mod) {
            attr += '"' + (key.substr(0,1).toUpperCase() + key.slice(1)) + '":'

            if (typeof this._mod[key] === 'string') {
                attr += '"' + this._mod[key] + '",'
            } else {
                attr += this._mod[key] + ','
            }
        }
        for (var key in this._param) {
            if (typeof this._param[key] === 'string' || typeof this._param[key] === 'number') {
                attr += '"'+ key +'":"'+ this._param[key] +'",'
            }
        }
        attr += '}'

        var children = ''
        for (var i = 0, ii = this._children.length; i < ii; i++) {
            if (this._children[i] instanceof BemNode) {
                children += this._children[i].toStringOfFunctions()
            } else {
                children += '"'+ escapeDoubleQuotes(this._children[i].toString()) +'"'
            }

            if (i < ii - 1) {
                children += ','
            }
        }

        return 'Beast.node(' +
            '"'+ this._nodeName + '",' +
            (attr === '{}' ? 'undefined' : attr) +
            (children ? ',' + children + ')' : ')')
    },

    /**
     * Converts BemNode to HTML
     * @return string HTML
     */
    toHtml: function () {
        // Call expand handler
        if (!this._isExpanded && this._decl && this._decl.__commonExpand) {
            this._isExpandContext = true
            this._decl.__commonExpand.call(this)
            this._completeExpand()
            this._isExpandContext = false
        }

        // HTML attrs
        var attrs = ''

        for (var key in this._domAttr)  {
            attrs += ' ' + key + '="' + escapeDoubleQuotes(this._domAttr[key].toString()) + '"'
        }

        // Class attr
        attrs += ' class="' + this._setDomNodeClasses(true) + '"'

        // Style attr
        var style = ''
        for (var key in this._css) {
            if (this._css[key] || this._css[key] === 0) {
                style += camelCaseToDash(key) + ':' + escapeDoubleQuotes(this._css[key]) + ';'
            }
        }

        if (style !== '') {
            attrs += ' style="' + style + '"'
        }

        // Stringify _domNodeEventHandlers
        if (this._domNodeEventHandlers) {
            attrs += ' data-event-handlers="' + encodeURIComponent(stringifyObject(this._domNodeEventHandlers)) + '"'
        }

        // Stringify _modHandlers
        if (this._modHandlers) {
            attrs += ' data-mod-handlers="' + encodeURIComponent(stringifyObject(this._modHandlers)) + '"'
        }

        // Stringify properties
        if (!objectIsEmpty(this._mod)) {
            attrs += ' data-mod="' + encodeURIComponent(stringifyObject(this._mod)) + '"'
        }
        if (!objectIsEmpty(this._param)) {
            attrs += ' data-param="' + encodeURIComponent(stringifyObject(this._param)) + '"'
        }
        if (this._mix.length !== 0) {
            attrs += ' data-mix="' + encodeURIComponent(stringifyObject(this._mix)) + '"'
        }
        if (this._afterDomInitHandlers.length !== 0) {
            attrs += ' data-after-dom-init-handlers="' + encodeURIComponent(stringifyObject(this._afterDomInitHandlers)) + '"'
        }
        if (this._implementedNode !== undefined) {
            attrs += ' data-implemented-node-name="' + this._implementedNode._nodeName + '"'
        }

        // HTML tag
        if (SingleTag[this._tag] === 1) {
            return '<' + this._tag + attrs + '/>'
        } else {
            var content = ''
            for (var i = 0, ii = this._children.length; i < ii; i++) {
                if (this._children[i] instanceof BemNode) {
                    content += this._children[i].toHtml()
                } else {
                    content += escapeHtmlTags(this._children[i].toString())
                }
            }
            return '<' + this._tag + attrs + '>' + content + '</' + this._tag + '>'
        }
    },

    /**
     * Calls expand declaration in runtime
     */
    expand: function () {
        // Replace old children
        this.empty()

        // Append new children without DOM-node creating (_isReplaceContext flag)
        this._isReplaceContext = true
        this.append.apply(this, arguments)

        // Call expand function
        if (this._decl && this._decl.expand) {
            this._isExpandContext = true
            this._decl.expand.call(this)
            this._completeExpand()
            this._isExpandContext = false
        }

        this._isReplaceContext = false

        // Render children
        for (var i = 0, ii = this._children.length; i < ii; i++) {
            this._renderChildWithIndex(i)
        }

        // Call domInit function
        if (this._decl && this._decl.domInit) {
            this._decl.domInit.call(this)
        }

        // Call implemented domInit function
        if (this._implementedNode &&
            this._implementedNode._decl &&
            this._implementedNode._decl.domInit) {
            this._implementedNode._decl.domInit.call(this)
        }

        return this
    },

    /**
     * Rerenders BemNode after state change
     */
    renderState: function () {
        // Clone itself
        var clone = {}
        clone.__proto__ = this.__proto__
        for (var i in this) {
            if (
                i === '_css' || i === '_domAttr' || i === '_mod' ||
                i === '_modHandlers' || i === '_domNodeEventHandlers' || i === '_windowEventHandlers'
            ) {
                clone[i] = cloneObject(this[i])
            }
            else {
                clone[i] = this[i]
            }
        }
        for (var i = 0, ii = clone._children.length; i < ii; i++) {
            if (clone._children[i] instanceof BemNode) {
                clone._children[i]._parentNode = clone
            }
        }

        // Remove handlers added in expand context
        if (this._modHandlers !== undefined) {
            for (var name in this._modHandlers) {
                for (var value in this._modHandlers[name]) {
                    for (var i = 0, ii = this._modHandlers[name][value].length; i < ii; i++) {
                        if (this._modHandlers[name][value][i].isExpandContext) {
                            this._modHandlers[name][value].splice(i,1)
                            i--
                            ii--
                        }
                    }
                }
            }
        }
        if (this._domNodeEventHandlers !== undefined) {
            for (var eventName in this._domNodeEventHandlers) {
                for (var i = 0, ii = this._domNodeEventHandlers[eventName].length; i < ii; i++) {
                    if (this._domNodeEventHandlers[eventName][i].isExpandContext) {
                        if (this._domNode !== undefined) {
                            this._domNode.removeEventListener(eventName, this._domNodeEventHandlers[eventName][i])
                        }
                        this._domNodeEventHandlers[eventName].splice(i,1)
                        i--
                        ii--
                    }
                }
            }
        }
        if (this._windowEventHandlers !== undefined) {
            for (var eventName in this._windowEventHandlers) {
                for (var i = 0, ii = this._windowEventHandlers[eventName].length; i < ii; i++) {
                    if (this._windowEventHandlers[eventName][i].isExpandContext) {
                        window.removeEventListener(
                            eventName, this._windowEventHandlers[eventName][i]
                        )
                        this._windowEventHandlers[eventName].splice(i,1)
                        i--
                        ii--
                    }
                }
            }
        }

        // Detach DOM node and children
        this._domNode = undefined
        this._children = []
        this._elems = []
        this._implementedNode = undefined
        this._isExpanded = false
        this._hasExpandContextEventHandlers = false
        this._hasExpandContextWindowEventHandlers = false
        this._hasExpandContextModHandlers = false
        this._hasDomInitContextWindowEventHandlers = false
        this._renderedOnce = false

        // Expand
        this._expandForRenderState()

        // Update nodes hashes
        this._updateHash()
        clone._updateHash()

        // Patch DOM
        Beast.patchDom(clone._domNode.parentNode, this, clone)
        this._domInit(true)

        // Event
        this.trigger('DidRenderState')
    },

    /**
     * Recursive expanding BemNodes
     * isNewNode boolean If node is new call compilated expand else call expand from decl
     */
    _expandForRenderState: function (isNewNode) {
        this._isRenderStateContext = true

        // Expand itself
        if (this._decl && (this._decl.expand || this._decl.__commonExpand)) {
            this._isExpandContext = true
            if (isNewNode) {
                this._decl.__commonExpand.call(this)
            } else {
                this._decl.expand.call(this)
            }
            this._completeExpand()
            this._isExpandContext = false
        }

        // Could be detached from parent when implemented with other node
        if (this._parentNode !== undefined) {
            // Expand children
            for (var i = 0, ii = this._children.length; i < ii; i++) {
                if (this._children[i] instanceof BemNode) {
                    this._children[i]._expandForRenderState(true)
                }
            }
        }

        this._isRenderStateContext = false
    }
}

})();
