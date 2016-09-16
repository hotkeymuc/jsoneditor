import { h, Component } from 'preact'

import { setIn, updateIn } from './utils/immutabilityHelpers'
import {
  expand,
  jsonToData, dataToJson, toDataPath, patchData, compileJSONPointer
} from './jsonData'
import {
  duplicate, insert, append, changeType, changeValue, changeProperty, sort
} from './actions'
import JSONNode from './JSONNode'

export default class TreeMode extends Component {
  // TODO: define propTypes

  constructor (props) {
    super(props)

    // TODO: don't put name and expand like this in the constructor
    const name   = this.props.options && this.props.options.name || null
    const expand = this.props.options && this.props.options.expand || TreeMode.expand

    const data = jsonToData([], this.props.data || {}, expand)

    this.state = {
      options: {
        name
      },

      data,

      history: [data],
      historyIndex: 0,
      
      events: {
        onChangeProperty: this.handleChangeProperty,
        onChangeValue: this.handleChangeValue,
        onChangeType: this.handleChangeType,
        onInsert: this.handleInsert,
        onAppend: this.handleAppend,
        onDuplicate: this.handleDuplicate,
        onRemove: this.handleRemove,
        onSort: this.handleSort,

        onExpand: this.handleExpand
      },

      search: null
    }
  }

  render (props, state) {
    return h('div', {class: 'jsoneditor'}, [
      h('div', {class: 'jsoneditor-menu'}, [
          h('button', {
            class: 'jsoneditor-expand-all',
            title: 'Expand all objects and arrays',
            onClick: this.handleExpandAll
          }),
          h('button', {
            class: 'jsoneditor-collapse-all',
            title: 'Collapse all objects and arrays',
            onClick: this.handleCollapseAll
          }),
          h('div', {class: 'jsoneditor-vertical-menu-separator'}),
          h('button', {
            class: 'jsoneditor-undo',
            title: 'Undo last action',
            disabled: !this.canUndo(),
            onClick: this.undo
          }),
          h('button', {
            class: 'jsoneditor-redo',
            title: 'Redo',
            disabled: !this.canRedo(),
            onClick: this.redo
          })
      ]),

      h('div', {class: 'jsoneditor-treemode', contentEditable: 'false', onClick: JSONNode.hideContextMenu}, [
        h('ul', {class: 'jsoneditor-list', contentEditable: 'false'}, [
          h(JSONNode, {
            data: state.data,
            events: state.events,
            options: state.options,
            parent: null,
            prop: null
          })
        ])
      ])
    ])
  }

  handleChangeValue = (path, value) => {
    this.handlePatch(changeValue(this.state.data, path, value))
  }

  handleChangeProperty = (parentPath, oldProp, newProp) => {
    this.handlePatch(changeProperty(this.state.data, parentPath, oldProp, newProp))
  }

  handleChangeType = (path, type) => {
    this.handlePatch(changeType(this.state.data, path, type))
  }

  handleInsert = (path, type) => {
    this.handlePatch(insert(this.state.data, path, type))
  }

  handleAppend = (parentPath, type) => {
    this.handlePatch(append(this.state.data, parentPath, type))
  }

  handleDuplicate = (path) => {
    this.handlePatch(duplicate(this.state.data, path))
  }

  handleRemove = (path) => {
    const patch = [{
      op: 'remove',
      path: compileJSONPointer(path)
    }]

    this.handlePatch(patch)
  }

  handleSort = (path, order = null) => {
    this.handlePatch(sort(this.state.data, path, order))
  }

  handleExpand = (path, expanded, recurse) => {
    if (recurse) {
      const dataPath = toDataPath(this.state.data, path)

      this.setState({
        data: updateIn(this.state.data, dataPath, function (child) {
          return expand(child, (path) => true, expanded)
        })
      })
    }
    else {
      this.setState({
        data: expand(this.state.data, path, expanded)
      })
    }
  }

  handleExpandAll = () => {
    const expanded = true

    this.setState({
      data: expand(this.state.data, expandAll, expanded)
    })
  }

  handleCollapseAll = () => {
    const expanded = false

    this.setState({
      data: expand(this.state.data, expandAll, expanded)
    })
  }

  /**
   * Apply a JSONPatch to the current JSON document and emit a change event
   * @param {Array} actions
   */
      // TODO: rename all handle* methods to _handle*
  handlePatch = (actions) => {
    // apply changes
    const revert = this.patch(actions)

    // emit change event
    if (this.props.options && this.props.options.onChange) {
      this.props.options.onChange(actions, revert)
    }
  }

  canUndo = () => {
    return this.state.historyIndex < this.state.history.length
  }

  canRedo = () => {
    return this.state.historyIndex > 0
  }

  undo = () => {
    if (this.canUndo()) {
      const history = this.state.history
      const historyIndex = this.state.historyIndex
      const undo = history[historyIndex].undo

      // FIXME: should call a patch method with does not adjust history but does emit a change event
      this.handlePatch(undo)

      this.setState({
        history,
        historyIndex: historyIndex + 1
      })
    }
  }

  redo = () => {
    if (this.canRedo()) {
      const history = this.state.history
      const historyIndex = this.state.historyIndex - 1
      const redo = history[historyIndex].redo

      // FIXME: should call a patch method with does not adjust history but does emit a change event
      this.handlePatch(redo)

      this.setState({
        history,
        historyIndex
      })
    }
  }

  /**
   * Apply a JSONPatch to the current JSON document
   * @param {Array} actions   JSONPatch actions
   * @return {Array} Returns a JSONPatch to revert the applied patch
   */
  patch (actions) {
    const result = patchData(this.state.data, actions)
    const data = result.data

    const newEntry = {
      redo: actions,
      undo: result.revert
    }
    const history = [newEntry]
        .concat(this.state.history.slice(this.state.historyIndex))
        .slice(0, 1000)

    this.setState({
      data,
      history,
      historyIndex: 0
    })

    return result.revert
  }

  /**
   * Set JSON object in editor
   * @param {Object | Array | string | number | boolean | null} json   JSON data
   * @param {SetOptions} [options]
   */
  set (json, options = {}) {
    const data = jsonToData([], json, options.expand || TreeMode.expand)

    this.setState({
      options: setIn(this.state.options, ['name'], options && options.name || null),

      data,
      // TODO: do we want to keep history when .set(json) is called?
      history: [],
      historyIndex: 0
    })
  }

  /**
   * Get JSON from the editor
   * @returns {Object | Array | string | number | boolean | null} json
   */
  get () {
    return dataToJson(this.state.data)
  }

  /**
   * Expand one or multiple objects or arrays
   * @param {Path | function (path: Path) : boolean} callback
   */
  expand (callback) {
    this.setState({
      data: expand(this.state.data, callback, true)
    })
  }

  /**
   * Collapse one or multiple objects or arrays
   * @param {Path | function (path: Path) : boolean} callback
   */
  collapse (callback) {
    this.setState({
      data: expand(this.state.data, callback, false)
    })
  }

  // TODO: implement getText and setText

  /**
   * Default function to determine whether or not to expand a node initially
   *
   * Rule: expand the root node only
   *
   * @param {Array.<string | number>} path
   * @return {boolean}
   */
  static expand (path) {
    return path.length === 0
  }

}


function expandAll (path) {
  return true
}
