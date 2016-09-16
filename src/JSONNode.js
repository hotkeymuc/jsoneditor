import { h, Component } from 'preact'

import ContextMenu from './ContextMenu'
import { escapeHTML, unescapeHTML } from './utils/stringUtils'
import { getInnerText } from './utils/domUtils'
import { stringConvert, valueType, isUrl } from  './utils/typeUtils'

// TYPE_TITLES with explanation for the different types
const TYPE_TITLES = {
  'value': 'Item type "value". ' +
    'The item type is automatically determined from the value ' +
    'and can be a string, number, boolean, or null.',
  'object': 'Item type "object". ' +
    'An object contains an unordered set of key/value pairs.',
  'array': 'Item type "array". ' +
    'An array contains an ordered collection of values.',
  'string': 'Item type "string". ' +
    'Item type is not determined from the value, ' +
    'but always returned as string.'
}

const URL_TITLE = 'Ctrl+Click or Ctrl+Enter to open url'

/**
 * @type {JSONNode | null} activeContextMenu  singleton holding the JSONNode having
 *                                            the active (visible) context menu
 */
let activeContextMenu = null

export default class JSONNode extends Component {
  // TODO: define propTypes

  constructor (props) {
    super(props)

    this.state = {
      menu: null,        // context menu
      appendMenu: null,  // append context menu (used in placeholder of empty object/array)
    }

    // TODO: use function bindMethods(this). Gives issues for some reason, we lose focus whilst typing
    this.handleChangeProperty = this.handleChangeProperty.bind(this)
    this.handleChangeValue = this.handleChangeValue.bind(this)
    this.handleClickValue = this.handleClickValue.bind(this)
    this.handleKeyDownValue = this.handleKeyDownValue.bind(this)
    this.handleExpand = this.handleExpand.bind(this)
    this.handleContextMenu = this.handleContextMenu.bind(this)
    this.handleAppendContextMenu = this.handleAppendContextMenu.bind(this)
  }

  render (props) {
    if (props.data.type === 'array') {
      return this.renderJSONArray(props)
    }
    else if (props.data.type === 'object') {
      return this.renderJSONObject(props)
    }
    else {
      return this.renderJSONValue(props)
    }
  }

  renderJSONObject ({prop, data, options, events}) {
    const childCount = data.props.length
    const contents = [
      h('div', {class: 'jsoneditor-node jsoneditor-object'}, [
        this.renderExpandButton(),
        this.renderContextMenuButton(),
        this.renderProperty(prop, data, options),
        this.renderReadonly(`{${childCount}}`, `Array containing ${childCount} items`)
      ])
    ]

    if (data.expanded) {
      if (data.props.length > 0) {
        const props = data.props.map(prop => {
          return h(JSONNode, {
            parent: this,
            prop: prop.name,
            data: prop.value,
            options,
            events
          })
        })

        contents.push(h('ul', {key: 'props', class: 'jsoneditor-list'}, props))
      }
      else {
        contents.push(h('ul', {key: 'append', class: 'jsoneditor-list'}, [
          this.renderAppend('(empty object)')
        ]))
      }
    }

    return h('li', {}, contents)
  }

  renderJSONArray ({prop, data, options, events}) {
    const childCount = data.items.length
    const contents = [
      h('div', {class: 'jsoneditor-node jsoneditor-array'}, [
        this.renderExpandButton(),
        this.renderContextMenuButton(),
        this.renderProperty(prop, data, options),
        this.renderReadonly(`[${childCount}]`, `Array containing ${childCount} items`)
      ])
    ]

    if (data.expanded) {
      if (data.items.length > 0) {
        const items = data.items.map((child, index) => {
          return h(JSONNode, {
            parent: this,
            prop: index,
            data: child,
            options,
            events
          })
        })
        contents.push(h('ul', {key: 'items', class: 'jsoneditor-list'}, items))
      }
      else {
        contents.push(h('ul', {key: 'append', class: 'jsoneditor-list'}, [
          this.renderAppend('(empty array)')
        ]))
      }
    }

    return h('li', {}, contents)
  }

  renderJSONValue ({prop, data, options}) {
    return h('li', {}, [
      h('div', {class: 'jsoneditor-node'}, [
        this.renderPlaceholder(),
        this.renderContextMenuButton(),
        this.renderProperty(prop, data, options),
        this.renderSeparator(),
        this.renderValue(data.value)
      ])
    ])
  }

  /**
   * Render contents for an empty object or array
   * @param {string} text
   * @return {*}
   */
  renderAppend (text) {
    return h('li', {key: 'append'}, [
      h('div', {class: 'jsoneditor-node'}, [
        this.renderPlaceholder(),
        this.renderAppendContextMenuButton(),
        this.renderReadonly(text)
      ])
    ])
  }

  renderPlaceholder () {
    return h('div', {class: 'jsoneditor-button-placeholder'})
  }

  renderReadonly (text, title = null) {
    return h('div', {class: 'jsoneditor-readonly', title}, text)
  }

  renderProperty (prop, data, options) {
    if (prop !== null) {
      const isIndex = typeof prop === 'number' // FIXME: pass an explicit prop isIndex

      if (isIndex) { // array item
        return h('div', {
          class: 'jsoneditor-property jsoneditor-readonly',
          spellCheck: 'false'
        }, prop)
      }
      else { // object property
        const escapedProp = escapeHTML(prop)

        return h('div', {
          class: 'jsoneditor-property' + (prop.length === 0 ? ' jsoneditor-empty' : ''),
          contentEditable: 'true',
          spellCheck: 'false',
          onBlur: this.handleChangeProperty
        }, escapedProp)
      }
    }
    else {
      // root node
      const content = JSONNode._getRootName(data, options)

      return h('div', {
        class: 'jsoneditor-property jsoneditor-readonly',
        spellCheck: 'false',
        onBlur: this.handleChangeProperty
      }, content)
    }
  }

  renderSeparator() {
    return h('div', {class: 'jsoneditor-separator'}, ':')
  }

  renderValue (value) {
    const escapedValue = escapeHTML(value)
    const type = valueType (value)
    const _isUrl = isUrl(value)
    const isEmpty = escapedValue.length === 0

    return h('div', {
      class: JSONNode._getValueClass(type, _isUrl, isEmpty),
      contentEditable: 'true',
      spellCheck: 'false',
      onBlur: this.handleChangeValue,
      onInput: this.updateValueStyling,
      onClick: this.handleClickValue,
      onKeyDown: this.handleKeyDownValue,
      title: _isUrl ? URL_TITLE : null
    }, escapedValue)
  }

  /**
   * Note: this function manipulates the className and title of the editable div
   * outside of Preact, so the user gets immediate feedback
   * @param event
   */
  updateValueStyling = (event) => {
    const value = this._getValueFromEvent(event)
    const type = valueType (value)
    const _isUrl = isUrl(value)
    const isEmpty = false  // not needed, our div has a border and is clearly visible

    // find the editable div, the root
    let target = event.target
    while (target.contentEditable !== 'true') {
      target = target.parentNode
    }

    target.className = JSONNode._getValueClass(type, _isUrl, isEmpty)
    target.title = _isUrl ? URL_TITLE : ''

    // remove all classNames from childs (needed for IE and Edge)
    JSONNode._removeChildClasses(target)
  }

  /**
   * Create the className for the property value
   * @param {string} type
   * @param {boolean} isUrl
   * @param {boolean} isEmpty
   * @return {string}
   * @private
   */
  static _getValueClass (type, isUrl, isEmpty) {
    return 'jsoneditor-value ' +
        'jsoneditor-' + type +
        (isUrl ? ' jsoneditor-url' : '') +
        (isEmpty ? ' jsoneditor-empty' : '')
  }

  /**
   * Recursively remove all classes from the childs of this element
   * @param elem
   * @private
   */
  static _removeChildClasses (elem) {
    for (let i = 0; i < elem.childNodes.length; i++) {
      const child = elem.childNodes[i]
      if (child.class) {
        child.class = ''
      }
      JSONNode._removeChildClasses(child)
    }
  }

  renderExpandButton () {
    const className = `jsoneditor-button jsoneditor-${this.props.data.expanded ? 'expanded' : 'collapsed'}`
    return h('div', {class: 'jsoneditor-button-container'},
        h('button', {
          class: className,
          onClick: this.handleExpand,
          title:
            'Click to expand/collapse this field. \n' +
            'Ctrl+Click to expand/collapse including all childs.'
        })
    )
  }

  renderContextMenuButton () {
    const className = 'jsoneditor-button jsoneditor-contextmenu' +
        (this.state.menu ? ' jsoneditor-visible' : '')

    return h('div', {class: 'jsoneditor-button-container'}, [
      this.renderContextMenu(this.state.menu),
      h('button', {class: className, onClick: this.handleContextMenu})
    ])
  }

  renderAppendContextMenuButton () {
    const className = 'jsoneditor-button jsoneditor-contextmenu' +
        (this.state.appendMenu ? ' jsoneditor-visible' : '')

    return h('div', {class: 'jsoneditor-button-container'}, [
      this.renderAppendContextMenu(),
      h('button', {class: className, onClick: this.handleAppendContextMenu})
    ])
  }

  renderContextMenu () {
    if (!this.state.menu) {
      return null
    }

    const {anchor, root} = this.state.menu
    const path = this.getPath()
    const hasParent = this.props.parent !== null
    const type = this.props.data.type
    const events = this.props.events
    const items = [] // array with menu items

    items.push({
      text: 'Type',
      title: 'Change the type of this field',
      className: 'jsoneditor-type-' + type,
      submenu: [
        {
          text: 'Value',
          className: 'jsoneditor-type-value' + (type == 'value' ? ' jsoneditor-selected' : ''),
          title: TYPE_TITLES.value,
          click: () => events.onChangeType(path, 'value')
        },
        {
          text: 'Array',
          className: 'jsoneditor-type-array' + (type == 'array' ? ' jsoneditor-selected' : ''),
          title: TYPE_TITLES.array,
          click: () => events.onChangeType(path, 'array')
        },
        {
          text: 'Object',
          className: 'jsoneditor-type-object' + (type == 'object' ? ' jsoneditor-selected' : ''),
          title: TYPE_TITLES.object,
          click: () => events.onChangeType(path, 'object')
        },
        {
          text: 'String',
          className: 'jsoneditor-type-string' + (type == 'string' ? ' jsoneditor-selected' : ''),
          title: TYPE_TITLES.string,
          click: () => events.onChangeType(path, 'string')
        }
      ]
    })

    if (type === 'array' || type === 'object') {
      var direction = ((this.sortOrder == 'asc') ? 'desc': 'asc')
      items.push({
        text: 'Sort',
        title: 'Sort the childs of this ' + TYPE_TITLES.type,
        className: 'jsoneditor-sort-' + direction,
        click: () => events.onSort(path),
        submenu: [
          {
            text: 'Ascending',
            className: 'jsoneditor-sort-asc',
            title: 'Sort the childs of this ' + TYPE_TITLES.type + ' in ascending order',
            click: () => events.onSort(path, 'asc')
          },
          {
            text: 'Descending',
            className: 'jsoneditor-sort-desc',
            title: 'Sort the childs of this ' + TYPE_TITLES.type +' in descending order',
            click: () => events.onSort(path, 'desc')
          }
        ]
      })
    }

    if (hasParent) {
      if (items.length) {
        // create a separator
        items.push({
          'type': 'separator'
        })
      }

      // create insert button
      items.push({
        text: 'Insert',
        title: 'Insert a new item with type \'value\' after this item (Ctrl+Ins)',
        submenuTitle: 'Select the type of the item to be inserted',
        className: 'jsoneditor-insert',
        click: () => events.onInsert(path, 'value'),
        submenu: [
          {
            text: 'Value',
            className: 'jsoneditor-type-value',
            title: TYPE_TITLES.value,
            click: () => events.onInsert(path, 'value')
          },
          {
            text: 'Array',
            className: 'jsoneditor-type-array',
            title: TYPE_TITLES.array,
            click: () => events.onInsert(path, 'array')
          },
          {
            text: 'Object',
            className: 'jsoneditor-type-object',
            title: TYPE_TITLES.object,
            click: () => events.onInsert(path, 'object')
          },
          {
            text: 'String',
            className: 'jsoneditor-type-string',
            title: TYPE_TITLES.string,
            click: () => events.onInsert(path, 'string')
          }
        ]
      })

      // create duplicate button
      items.push({
        text: 'Duplicate',
        title: 'Duplicate this item (Ctrl+D)',
        className: 'jsoneditor-duplicate',
        click: () => events.onDuplicate(path)
      })

      // create remove button
      items.push({
        text: 'Remove',
        title: 'Remove this item (Ctrl+Del)',
        className: 'jsoneditor-remove',
        click: () => events.onRemove(path)
      })
    }

    // TODO: implement a hook to adjust the context menu

    return h(ContextMenu, {anchor, root, items})
  }

  renderAppendContextMenu () {
    if (!this.state.appendMenu) {
      return null
    }

    const {anchor, root} = this.state.appendMenu
    const path = this.getPath()
    const events = this.props.events
    const items = [] // array with menu items

    // create insert button
    items.push({
      text: 'Insert',
      title: 'Insert a new item with type \'value\' after this item (Ctrl+Ins)',
      submenuTitle: 'Select the type of the item to be inserted',
      className: 'jsoneditor-insert',
      click: () => events.onAppend(path, 'value'),
      submenu: [
        {
          text: 'Value',
          className: 'jsoneditor-type-value',
          title: TYPE_TITLES.value,
          click: () => events.onAppend(path, 'value')
        },
        {
          text: 'Array',
          className: 'jsoneditor-type-array',
          title: TYPE_TITLES.array,
          click: () => events.onAppend(path, 'array')
        },
        {
          text: 'Object',
          className: 'jsoneditor-type-object',
          title: TYPE_TITLES.object,
          click: () => events.onAppend(path, 'object')
        },
        {
          text: 'String',
          className: 'jsoneditor-type-string',
          title: TYPE_TITLES.string,
          click: () => events.onAppend(path, 'string')
        }
      ]
    })

    // TODO: implement a hook to adjust the context menu

    return h(ContextMenu, {anchor, root, items})
  }

  shouldComponentUpdate(nextProps, nextState) {
    let prop

    for (prop in nextProps) {
      if (nextProps.hasOwnProperty(prop) && this.props[prop] !== nextProps[prop]) {
        return true
      }
    }

    for (prop in nextState) {
      if (nextState.hasOwnProperty(prop) && this.state[prop] !== nextState[prop]) {
        return true
      }
    }

    return false
  }

  static _getRootName (data, options) {
    return typeof options.name === 'string'
        ? options.name
        : (data.type === 'object' || data.type === 'array')
        ? data.type
        : valueType(data.value)
  }

  handleChangeProperty (event) {
    const parentPath = this.props.parent.getPath()
    const oldProp = this.props.prop
    const newProp = unescapeHTML(getInnerText(event.target))

    if (newProp !== oldProp) {
      this.props.events.onChangeProperty(parentPath, oldProp, newProp)
    }
  }

  handleChangeValue (event) {
    const value = this._getValueFromEvent(event)

    if (value !== this.props.data.value) {
      this.props.events.onChangeValue(this.getPath(), value)
    }
  }

  handleClickValue (event) {
    if (event.ctrlKey && event.button === 0) { // Ctrl+Left click
      this._openLinkIfUrl(event)
    }
  }

  handleKeyDownValue (event) {
    if (event.ctrlKey && event.which === 13) { // Ctrl+Enter
      this._openLinkIfUrl(event)
    }
  }

  handleExpand (event) {
    const recurse = event.ctrlKey
    const expanded = !this.props.data.expanded

    this.props.events.onExpand(this.getPath(), expanded, recurse)
  }

  handleContextMenu (event) {
    event.stopPropagation()

    if (this.state.menu) {
      // hide context menu
      JSONNode.hideContextMenu()
    }
    else {
      // hide any currently visible context menu
      JSONNode.hideContextMenu()

      // show context menu
      this.setState({
        menu: {
          anchor: event.target,
          root: JSONNode._findRootElement(event)
        }
      })
      activeContextMenu = this
    }
  }

  handleAppendContextMenu(event) {
    event.stopPropagation()

    if (this.state.appendMenu) {
      // hide append context menu
      JSONNode.hideContextMenu()
    }
    else {
      // hide any currently visible context menu
      JSONNode.hideContextMenu()

      // show append context menu
      this.setState({
        appendMenu: {
          anchor: event.target,
          root: JSONNode._findRootElement(event)
        }
      })
      activeContextMenu = this
    }
  }

  /**
   * Singleton function to hide the currently visible context menu if any.
   */
  static hideContextMenu () {
    if (activeContextMenu) {
      activeContextMenu.setState({
        menu: null,
        appendMenu: null
      })
      activeContextMenu = null
    }
  }

  /**
   * When this JSONNode holds an URL as value, open this URL in a new browser tab
   * @param event
   * @private
   */
  _openLinkIfUrl (event) {
    const value = this._getValueFromEvent(event)

    if (isUrl(value)) {
      event.preventDefault()
      event.stopPropagation()

      window.open(value, '_blank')
    }
  }

  /**
   * Get the path of this JSONNode
   * @return {Path}
   */
  getPath () {
    const path = this.props.parent
        ? this.props.parent.getPath()
        : []

    if (this.props.prop !== null) {
      path.push(this.props.prop)
    }

    return path
  }

  /**
   * Get the value of the target of an event, and convert it to it's type
   * @param event
   * @return {string | number | boolean | null}
   * @private
   */
  _getValueFromEvent (event) {
    const stringValue = unescapeHTML(getInnerText(event.target))
    return this.props.data.type === 'string'
        ? stringValue
        : stringConvert(stringValue)
  }

  /**
   * Find the root DOM element of the JSONEditor
   * Search is done based on the CSS class 'jsoneditor'
   * @param event
   * @return {*}
   * @private
   */
  static _findRootElement (event) {
    function isEditorElement (elem) {
      return elem.className.split(' ').indexOf('jsoneditor') !== -1
    }

    let elem = event.target
    while (elem) {
      if (isEditorElement(elem)) {
        return elem
      }

      elem = elem.parentNode
    }

    return null
  }

}
