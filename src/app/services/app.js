/*
 * Copyright 2024 The Ray Optics Simulation authors and contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @module app
 * @description The main app "service". Many parts of the app are not fully refactored to a proper Vue approach yet, so some mixed-paradigm code exists in this file.
 */

import * as bootstrap from 'bootstrap';
import 'bootstrap/scss/bootstrap.scss';
import { Scene, Simulator, Editor, geometry, sceneObjs } from '../../core/index.js';
import { DATA_VERSION } from '../../core/Scene.js';
import { objBar } from '../services/objBar.js';
import { saveAs } from 'file-saver';
import i18next, { t, use } from 'i18next';
import { jsonEditorService } from '../services/jsonEditor.js';
import { statusEmitter, STATUS_EVENT_NAMES } from '../composables/useStatus.js';
import { mapURL, parseLinks } from '../utils/links.js';

function initScene() {
  scene = new Scene();
  app.scene = scene;
}

function initAppService() {

  jsonEditorService.updateContent(scene.toJSON());

  let dpr = window.devicePixelRatio || 1;

  canvas = document.getElementById('canvasAboveLight');
  canvasBelowLight = document.getElementById('canvasBelowLight');
  canvasLight = document.getElementById('canvasLight');
  canvasLightWebGL = document.getElementById('canvasLightWebGL');
  canvasGrid = document.getElementById('canvasGrid');

  let gl;

  try {
    const contextAttributes = {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
    };
    gl = canvasLightWebGL.getContext('webgl', contextAttributes) || canvasLightWebGL.getContext('experimental-webgl', contextAttributes);
    var ext = gl.getExtension('OES_texture_float');

    if (!ext) {
      throw new Error('OES_texture_float not supported.');
    }
  } catch (e) {
    console.log('Failed to initialize WebGL: ' + e);
    gl = null;
  }

  simulator = new Simulator(scene,
    canvasLight.getContext('2d'),
    canvasBelowLight.getContext('2d'),
    canvasAboveLight.getContext('2d'),
    canvasGrid.getContext('2d'),
    document.createElement('canvas').getContext('2d'),
    true,
    Infinity,
    gl
  );
  app.simulator = simulator;

  editor = new Editor(scene, canvas, simulator);
  app.editor = editor;

  document.title = i18next.t('main:pages.simulator') + ' - ' + i18next.t('main:project.name');
  document.getElementById('home').href = mapURL('/home');
  document.getElementById('about').href = mapURL('/about');

  objBar.initialize(document.getElementById('obj_bar_main'), document.getElementById('obj_name'));
  app.objBar = objBar;

  objBar.on('showAdvancedEnabled', function (enabled) {
    if (enabled) {
      document.getElementById('showAdvanced').style.display = '';
      document.getElementById('showAdvanced_mobile_container').style.display = '';
    } else {
      document.getElementById('showAdvanced').style.display = 'none';
      document.getElementById('showAdvanced_mobile_container').style.display = 'none';
    }
  });

  objBar.on('edit', function () {
    simulator.updateSimulation(!objBar.targetObj.constructor.isOptical, true);
  });

  objBar.on('editEnd', function () {
    editor.onActionComplete();
  });

  objBar.on('requestUpdate', function () {
    editor.selectObj(editor.selectedObjIndex);
  });

  document.getElementById('apply_to_all').addEventListener('change', function () {
    objBar.shouldApplyToAll = this.checked;
  });




  simulator.dpr = dpr;

  simulator.on('simulationStart', function () {
    statusEmitter.emit(STATUS_EVENT_NAMES.SIMULATOR_STATUS, {
      rayCount: 0,
      totalTruncation: 0,
      brightnessScale: null,
      timeElapsed: 0,
      isSimulatorRunning: true,
      isForceStop: false
    });
  });

  simulator.on('simulationPause', function () {
    statusEmitter.emit(STATUS_EVENT_NAMES.SIMULATOR_STATUS, {
      rayCount: simulator.processedRayCount,
      totalTruncation: simulator.totalTruncation,
      brightnessScale: simulator.brightnessScale,
      timeElapsed: new Date() - simulator.simulationStartTime,
      isSimulatorRunning: true,
      isForceStop: false
    });
  });
  
  simulator.on('simulationStop', function () {
    statusEmitter.emit(STATUS_EVENT_NAMES.SIMULATOR_STATUS, {
      rayCount: simulator.processedRayCount,
      totalTruncation: simulator.totalTruncation,
      brightnessScale: simulator.brightnessScale,
      timeElapsed: new Date() - simulator.simulationStartTime,
      isSimulatorRunning: false,
      isForceStop: true
    });
  });
  
  simulator.on('simulationComplete', function () {
    statusEmitter.emit(STATUS_EVENT_NAMES.SIMULATOR_STATUS, {
      rayCount: simulator.processedRayCount,
      totalTruncation: simulator.totalTruncation,
      brightnessScale: simulator.brightnessScale,
      timeElapsed: new Date() - simulator.simulationStartTime,
      isSimulatorRunning: false,
      isForceStop: false
    });
  });

  simulator.on('requestUpdateErrorAndWarning', function () {
    updateErrorAndWarning();
  });

  simulator.on('webglContextLost', function () {
    console.log('WebGL context lost');
    canvasLightWebGL.style.display = 'none';
    canvasLight.style.display = '';
  });


  editor.on('positioningStart', function (e) {
    document.getElementById('xybox').style.left = (e.dragContext.targetPoint.x * scene.scale + scene.origin.x) + 'px';
    document.getElementById('xybox').style.top = (e.dragContext.targetPoint.y * scene.scale + scene.origin.y) + 'px';
    document.getElementById('xybox').value = '(' + (e.dragContext.targetPoint.x) + ',' + (e.dragContext.targetPoint.y) + ')';
    document.getElementById('xybox').size = document.getElementById('xybox').value.length;
    document.getElementById('xybox').style.display = '';
    document.getElementById('xybox').select();
    document.getElementById('xybox').setSelectionRange(1, document.getElementById('xybox').value.length - 1);
    //console.log("show xybox");
    xyBox_cancelContextMenu = true;
  });

  editor.on('requestPositioningComfirm', function (e) {
    confirmPositioning(e.ctrl, e.shift);
  });

  editor.on('positioningEnd', function (e) {
    document.getElementById('xybox').style.display = 'none';
  });

  editor.on('mouseCoordinateChange', function (e) {
    statusEmitter.emit(STATUS_EVENT_NAMES.MOUSE_POSITION, 
      e.mousePos ? { x: e.mousePos.x, y: e.mousePos.y } : { x: undefined, y: undefined }
    );
  });

  editor.emit('mouseCoordinateChange', { mousePos: null });

  editor.on('selectionChange', function (e) {
    hideAllPopovers();
    if (objBar.pendingEvent) {
      // If the user is in the middle of editing a value, then clearing the innerHTML of obj_bar_main will cause the change event not to fire, so we need to manually fire it.
      objBar.pendingEvent();
      objBar.pendingEvent = null;
    }

    if (e.newIndex >= 0) {
      objBar.targetObj = scene.objs[e.newIndex];

      document.getElementById('showAdvanced').style.display = 'none';
      document.getElementById('showAdvanced_mobile_container').style.display = 'none';

      document.getElementById('obj_bar_main').style.display = '';
      document.getElementById('obj_bar_main').innerHTML = '';
      scene.objs[e.newIndex].populateObjBar(objBar);

      if (document.getElementById('obj_bar_main').innerHTML != '') {
        for (var i = 0; i < scene.objs.length; i++) {
          if (i != e.newIndex && scene.objs[i].constructor.type == scene.objs[e.newIndex].constructor.type) {
            // If there is an object with the same type, then show "Apply to All"
            document.getElementById('apply_to_all_box').style.display = '';
            document.getElementById('apply_to_all_mobile_container').style.display = '';
            break;
          }
          if (i == scene.objs.length - 1) {
            document.getElementById('apply_to_all_box').style.display = 'none';
            document.getElementById('apply_to_all_mobile_container').style.display = 'none';
          }
        }
      } else {
        document.getElementById('apply_to_all_box').style.display = 'none';
        document.getElementById('apply_to_all_mobile_container').style.display = 'none';
      }


      document.getElementById('obj_bar').style.display = '';
    } else {
      document.getElementById('obj_bar').style.display = 'none';
      objBar.shouldShowAdvanced = false;
    }
  });

  editor.on('sceneLoaded', function (e) {
    document.getElementById('welcome').style.display = 'none';
    if (e.needFullUpdate) {
      // Update the UI for the loaded scene.

      if (scene.name) {
        document.title = scene.name + " - " + i18next.t('main:pages.simulator') + ' - ' + i18next.t('main:project.name');
        //document.getElementById('save_name').value = scene.name;
      } else {
        document.title = i18next.t('main:pages.simulator') + ' - ' + i18next.t('main:project.name');
      }

      editor.selectObj(editor.selectedObjIndex);

      document.dispatchEvent(new Event('sceneChanged'));
    }
  });

  editor.on('newAction', function (e) {
    jsonEditorService.updateContent(e.newJSON, e.oldJSON);
    syncUrl();
    warning = "";
    hasUnsavedChange = true;
  });

  editor.on('newUndoPoint', function (e) {
    document.getElementById('undo').disabled = false;
    document.getElementById('redo').disabled = true;
    document.getElementById('undo_mobile').disabled = false;
    document.getElementById('redo_mobile').disabled = true;
  });

  editor.on('undo', function (e) {
    document.getElementById('redo').disabled = false;
    document.getElementById('redo_mobile').disabled = false;
    if (editor.undoIndex == editor.undoLBound) {
      // The lower bound of undo data is reached
      document.getElementById('undo').disabled = true;
      document.getElementById('undo_mobile').disabled = true;
    }
    jsonEditorService.updateContent(editor.lastActionJson);
    syncUrl();
  });

  editor.on('redo', function (e) {
    document.getElementById('undo').disabled = false;
    document.getElementById('undo_mobile').disabled = false;
    if (editor.undoIndex == editor.undoUBound) {
      // The lower bound of undo data is reached
      document.getElementById('redo').disabled = true;
      document.getElementById('redo_mobile').disabled = true;
    }
    jsonEditorService.updateContent(editor.lastActionJson);
    syncUrl();
  });

  editor.on('scaleChange', function (e) {
    document.dispatchEvent(new Event('sceneChanged'));
  });

  editor.on('requestUpdateErrorAndWarning', function () {
    updateErrorAndWarning();
  });

  reset();

  document.getElementById('undo').disabled = true;
  document.getElementById('redo').disabled = true;

  document.getElementById('undo_mobile').disabled = true;
  document.getElementById('redo_mobile').disabled = true;


  window.onkeydown = function (e) {
    //Ctrl+Z or Cmd+Z
    if ((e.ctrlKey || e.metaKey) && e.keyCode == 90) {
      if (document.getElementById('undo').disabled == false) {
        editor.undo();
      }
      return false;
    }
    //Ctrl+D or Cmd+D
    if ((e.ctrlKey || e.metaKey) && e.keyCode == 68) {
      if (editor.selectedObjIndex != -1) {
        if (scene.objs[editor.selectedObjIndex].constructor.type == 'Handle') {
          scene.cloneObjsByHandle(editor.selectedObjIndex);
        } else {
          scene.cloneObj(editor.selectedObjIndex);
        }

        simulator.updateSimulation(!scene.objs[editor.selectedObjIndex].constructor.isOptical, true);
        editor.onActionComplete();
      }
      return false;
    }
    //Ctrl+Y or Cmd+Y
    if ((e.ctrlKey || e.metaKey) && e.keyCode == 89) {
      document.getElementById('redo').onclick();
    }

    //Ctrl+S or Cmd+S
    if ((e.ctrlKey || e.metaKey) && e.keyCode == 83) {
      save();
      return false;
    }

    //Ctrl+O or Cmd+O
    if ((e.ctrlKey || e.metaKey) && e.keyCode == 79) {
      document.getElementById('open').onclick();
      return false;
    }

    //esc
    if (e.keyCode == 27) {
      if (editor.isConstructing) {
        editor.undo();
      }
    }

    //Delete
    if (e.keyCode == 46 || e.keyCode == 8) {
      if (editor.selectedObjIndex != -1) {
        var selectedObjType = scene.objs[editor.selectedObjIndex].constructor.type;
        editor.removeObj(editor.selectedObjIndex);
        simulator.updateSimulation(!sceneObjs[selectedObjType].isOptical, true);
        editor.onActionComplete();
      }
      return false;
    }

    //Plus and Minus Keys for rotation
    if (e.keyCode == 107 || e.keyCode == 187) {             // + key for rotate clockwise
      if (editor.selectedObjIndex != -1) {
        scene.objs[editor.selectedObjIndex].rotate(1);
        simulator.updateSimulation(!scene.objs[editor.selectedObjIndex].constructor.isOptical, true);
        editor.onActionComplete();
      }
    }
    if (e.keyCode == 109 || e.keyCode == 189) {             // - key for rotate c-clockwise
      if (editor.selectedObjIndex != -1) {
        scene.objs[editor.selectedObjIndex].rotate(-1);
        simulator.updateSimulation(!scene.objs[editor.selectedObjIndex].constructor.isOptical, true);
        editor.onActionComplete();
      }
    }

    //Arrow Keys
    if (e.keyCode >= 37 && e.keyCode <= 40) {
      var step = scene.snapToGrid ? scene.gridSize : 1;
      if (editor.selectedObjIndex >= 0) {
        if (e.keyCode == 37) {
          scene.objs[editor.selectedObjIndex].move(-step, 0);
        }
        if (e.keyCode == 38) {
          scene.objs[editor.selectedObjIndex].move(0, -step);
        }
        if (e.keyCode == 39) {
          scene.objs[editor.selectedObjIndex].move(step, 0);
        }
        if (e.keyCode == 40) {
          scene.objs[editor.selectedObjIndex].move(0, step);
        }
        simulator.updateSimulation(!scene.objs[editor.selectedObjIndex].constructor.isOptical, true);
        editor.onActionComplete();
      }
      else if (scene.mode == 'observer') {
        if (e.keyCode == 37) {
          scene.observer.c.x -= step;
        }
        if (e.keyCode == 38) {
          scene.observer.c.y -= step;
        }
        if (e.keyCode == 39) {
          scene.observer.c.x += step;
        }
        if (e.keyCode == 40) {
          scene.observer.c.y += step;
        }
        simulator.updateSimulation(false, true);
        editor.onActionComplete();
      }
      else {
        // TODO: Is this a historical remnant? Should the expected behavior be to change `scene.origin` instead? Note however that some users may be using the current behavior to align the scene with the background image or the grid.
        for (var i = 0; i < scene.objs.length; i++) {
          if (e.keyCode == 37) {
            scene.objs[i].move(-step, 0);
          }
          if (e.keyCode == 38) {
            scene.objs[i].move(0, -step);
          }
          if (e.keyCode == 39) {
            scene.objs[i].move(step, 0);
          }
          if (e.keyCode == 40) {
            scene.objs[i].move(0, step);
          }
        }
        simulator.updateSimulation();
        editor.onActionComplete();
      }
    }
  };


  app.reset = function () {
    history.replaceState('', document.title, window.location.pathname + window.location.search);
    reset();
    document.getElementById("welcome_loading").style.display = 'none';
    document.getElementById("welcome_instruction").style.display = '';
    document.getElementById('welcome').style.display = '';
    document.dispatchEvent(new Event('sceneChanged'));
    editor.onActionComplete();
    hasUnsavedChange = false;
    jsonEditorService.updateContent(editor.lastActionJson);
  };

  app.getLink = getLink;
  app.openFile = function () {
    document.getElementById('openfile').click();
  };
  app.viewGallery = function () {
    window.open(mapURL('/gallery'));
  };


  document.getElementById('openfile').onchange = function () {
    openFile(this.files[0]);
  };

  app.cloneSelectedObj = function () {
    if (scene.objs[editor.selectedObjIndex].constructor.type == 'Handle') {
      scene.cloneObjsByHandle(editor.selectedObjIndex);
      scene.objs[editor.selectedObjIndex].move(scene.gridSize, scene.gridSize);
    } else {
      scene.cloneObj(editor.selectedObjIndex).move(scene.gridSize, scene.gridSize);
    }
    editor.selectObj(scene.objs.length - 1);
    simulator.updateSimulation(!scene.objs[editor.selectedObjIndex].constructor.isOptical, true);
    editor.onActionComplete();
  };

  app.deleteSelectedObj = function () {
    var selectedObjType = scene.objs[editor.selectedObjIndex].constructor.type;
    editor.removeObj(editor.selectedObjIndex);
    simulator.updateSimulation(!sceneObjs[selectedObjType].isOptical, true);
    editor.onActionComplete();
  };

  app.unselect = function () {
    editor.selectObj(-1);
    simulator.updateSimulation(true, true);
    editor.onActionComplete();
  };

  app.showAdvanced = function () {
    objBar.shouldShowAdvanced = true;
    editor.selectObj(editor.selectedObjIndex);
  };

  document.getElementById('xybox').onkeydown = function (e) {
    //console.log(e.keyCode)
    if (e.keyCode == 13) {
      //enter
      confirmPositioning(e.ctrlKey, e.shiftKey);
    }
    if (e.keyCode == 27) {
      //esc
      editor.endPositioning();
    }

    e.cancelBubble = true;
    if (e.stopPropagation) e.stopPropagation();
  };

  document.getElementById('xybox').oninput = function (e) {
    this.size = this.value.length;
  };

  document.getElementById('xybox').addEventListener('contextmenu', function (e) {
    if (xyBox_cancelContextMenu) {
      e.preventDefault();
      xyBox_cancelContextMenu = false;
    }
  }, false);


  window.ondragenter = function (e) {
    e.stopPropagation();
    e.preventDefault();
  };

  window.ondragover = function (e) {
    e.stopPropagation();
    e.preventDefault();
  };

  window.ondrop = function (e) {
    e.stopPropagation();
    e.preventDefault();

    var dt = e.dataTransfer;
    if (dt.files[0]) {
      var files = dt.files;
      openFile(files[0]);
    }
    else {
      var fileString = dt.getData('text');
      editor.loadJSON(fileString);
      editor.onActionComplete();
    }
  };

  canvas.addEventListener('contextmenu', function (e) {
    e.preventDefault();
  }, false);

  canvas.addEventListener('mousedown', function (e) {
    error = null;
  }, false);

  window.onerror = function (msg, url) {
    error = `Error: ${msg} at ${url}`;
    document.getElementById('welcome').style.display = 'none';
    updateErrorAndWarning();
  }

  // Update the scene when the URL changes
  window.onpopstate = function (event) {
    if (window.location.hash.length > 70) {
      // The URL contains a compressed JSON scene.
      require('json-url')('lzma').decompress(window.location.hash.substr(1)).then(json => {
        scene.backgroundImage = null;
        editor.loadJSON(JSON.stringify(json));
        editor.onActionComplete();
        hasUnsavedChange = false;
        jsonEditorService.updateContent(editor.lastActionJson);
      }).catch(e => {
        error = "JsonUrl: " + e;
        document.getElementById('welcome').style.display = 'none';
        updateErrorAndWarning();
      });;
    } else if (window.location.hash.length > 1) {
      // The URL contains a link to a gallery item.
      openSample(window.location.hash.substr(1) + ".json");
      history.replaceState('', document.title, window.location.pathname + window.location.search);
    }
  };

  window.onpopstate();

  window.addEventListener('message', function (event) {
    if (event.data && event.data.rayOpticsModuleName) {
      importModule(event.data.rayOpticsModuleName + '.json');
    }
  });

  document.getElementById('toolbar-loading').style.display = 'none';


  document.getElementById('help-dropdown').addEventListener('click', function (e) {
    e.stopPropagation();
  });

}


var canvas;
var canvasBelowLight;
var canvasLight;
var canvasLightWebGL;
var canvasGrid;
var scene;
var editor;
var simulator;
var xyBox_cancelContextMenu = false;
var hasUnsavedChange = false;
var warning = null;
var error = null;


function resetDropdownButtons() {
  // Remove the 'selected' class from all dropdown buttons
  document.querySelectorAll('.btn.dropdown-toggle.selected').forEach(function (button) {
    button.classList.remove('selected');
  });
  document.querySelectorAll('.btn.mobile-dropdown-trigger.selected').forEach(function (button) {
    button.classList.remove('selected');
  });
}

function hideAllPopovers() {
  console.log('hideAllPopovers');
  document.querySelectorAll('[data-bs-original-title]').forEach(function (element) {
    var popoverInstance = bootstrap.Popover.getInstance(element);
    if (popoverInstance) {
      popoverInstance.hide();
    }
    var tooltipInstance = bootstrap.Tooltip.getInstance(element);
    if (tooltipInstance) {
      tooltipInstance.hide();
    }
  });
}

function updateErrorAndWarning() {
  statusEmitter.emit(STATUS_EVENT_NAMES.SYSTEM_STATUS, {
    app: { 
      error: error, 
      warning: warning 
    },
    scene: { 
      error: scene.error, 
      warning: scene.warning 
    },
    simulator: { 
      error: simulator.error, 
      warning: simulator.warning 
    },
    objects: scene.objs.map((obj, i) => ({
      index: i,
      type: obj.constructor.type,
      error: obj.getError(),
      warning: obj.getWarning()
    }))
  });
}

function openSample(name) {
  var client = new XMLHttpRequest();
  client.open('GET', '../gallery/' + name);
  client.onload = function () {
    if (client.status >= 300) {
      error = "openSample: HTTP Request Error: " + client.status;
      document.getElementById('welcome').style.display = 'none';
      updateErrorAndWarning();
      return;
    }
    scene.backgroundImage = null;
    editor.loadJSON(client.responseText);

    editor.onActionComplete();
    hasUnsavedChange = false;
    jsonEditorService.updateContent(editor.lastActionJson);
  }
  client.onerror = function () {
    error = "openSample: HTTP Request Error";
    document.getElementById('welcome').style.display = 'none';
    updateErrorAndWarning();
  }
  client.ontimeout = function () {
    error = "openSample: HTTP Request Timeout";
    document.getElementById('welcome').style.display = 'none';
    updateErrorAndWarning();
  }

  client.send();
}

function importModule(name) {
  var client = new XMLHttpRequest();
  client.open('GET', '../modules/' + name);
  client.onload = function () {
    document.getElementById('welcome').style.display = 'none';
    if (client.status >= 300) {
      error = "importModule: HTTP Request Error: " + client.status;
      updateErrorAndWarning();
      return;
    }
    try {
      const moduleJSON = JSON.parse(client.responseText);
      for (let moduleName in moduleJSON.modules) {
        if (moduleJSON.modules.hasOwnProperty(moduleName)) {
          let newModuleName = moduleName;
          if (scene.modules[moduleName] && JSON.stringify(scene.modules[moduleName]) != JSON.stringify(moduleJSON.modules[moduleName])) {
            newModuleName = prompt(i18next.t('simulator:moduleModal.conflict'), moduleName);
            if (!newModuleName) {
              continue;
            }
          }
          scene.addModule(newModuleName, moduleJSON.modules[moduleName]);
        }
      }
    } catch (e) {
      error = "importModule: " + e.toString();
      updateErrorAndWarning();
      return;
    }
    document.dispatchEvent(new Event('sceneChanged'));
    simulator.updateSimulation(false, true);
    editor.onActionComplete();
  }
  client.onerror = function () {
    error = "importModule: HTTP Request Error";
    document.getElementById('welcome').style.display = 'none';
    updateErrorAndWarning();
  }
  client.ontimeout = function () {
    error = "importModule: HTTP Request Timeout";
    document.getElementById('welcome').style.display = 'none';
    updateErrorAndWarning();
  }

  client.send();
}

function reset() {
  document.title = i18next.t('main:pages.simulator') + ' - ' + i18next.t('main:project.name');
  //document.getElementById('save_name').value = "";

  editor.isConstructing = false;
  editor.endPositioning();

  scene.backgroundImage = null;
  scene.loadJSON(JSON.stringify({ version: DATA_VERSION }), () => { });
  scene.origin = geometry.point(0, 0);
  scene.scale = 1;

  let dpr = window.devicePixelRatio || 1;

  scene.setViewportSize(canvas.width / dpr, canvas.height / dpr);

  editor.selectObj(-1);

  editor.addingObjType = '';
  scene.backgroundImage = null;

  //Reset new UI.

  resetDropdownButtons();

  document.getElementById('tool_').checked = true;
  document.getElementById('tool__mobile').checked = true;

  document.getElementById('apply_to_all').checked = false;
  document.getElementById('apply_to_all_mobile').checked = false;

  simulator.updateSimulation();
}

var lastFullURL = "";
var syncUrlTimerId = -1;

function syncUrl() {
  if (!app.autoSyncUrl) return;
  if (document.getElementById('welcome').style.display != 'none') return;

  if (syncUrlTimerId != -1) {
    clearTimeout(syncUrlTimerId);
  }
  syncUrlTimerId = setTimeout(function () {
    var compressed = require('json-url')('lzma').compress(JSON.parse(editor.lastActionJson)).then(output => {
      var fullURL = "https://phydemo.app/ray-optics/simulator/#" + output;
      if (fullURL.length > 2041) {
        warning = i18next.t('simulator:generalWarnings.autoSyncUrlTooLarge');
        updateErrorAndWarning();
      } else {
        if (Math.abs(fullURL.length - lastFullURL.length) > 200) {
          // If the length of the scene change significantly, push a new history state to prevent accidental data loss.
          lastFullURL = fullURL;
          window.history.pushState(undefined, undefined, '#' + output);
        } else {
          lastFullURL = fullURL;
          window.history.replaceState(undefined, undefined, '#' + output);
        }
        hasUnsavedChange = false;
        warning = "";
        updateErrorAndWarning();
      }
    });
  }, 1000);
}

function hideWelcome() {
  document.getElementById('welcome').style.display = 'none';
}

function rename() {
  //scene.name = document.getElementById('save_name').value;
  if (scene.name) {
    document.title = scene.name + " - " + i18next.t('main:pages.simulator') + ' - ' + i18next.t('main:project.name');
  } else {
    document.title = i18next.t('main:pages.simulator') + ' - ' + i18next.t('main:project.name');
  }
  document.dispatchEvent(new Event('sceneChanged'));
  editor.onActionComplete();
}

function save() {
  rename();

  var blob = new Blob([editor.lastActionJson], { type: 'application/json' });
  saveAs(blob, (scene.name || "scene") + ".json");
  var saveModal = bootstrap.Modal.getInstance(document.getElementById('saveModal'));
  if (saveModal) {
    saveModal.hide();
  }
  hasUnsavedChange = false;
}

function openFile(readFile) {
  var reader = new FileReader();
  reader.readAsText(readFile);
  reader.onload = function (evt) {
    var fileString = evt.target.result;

    let isJSON = true;
    try {
      const parsed = JSON.parse(fileString);
      if (typeof parsed !== 'object' || parsed === null) {
        isJSON = false;
      }
    } catch (e) {
      isJSON = false;
    }

    if (isJSON) {
      // Load the scene file
      editor.loadJSON(fileString);
      hasUnsavedChange = false;
      editor.onActionComplete();
      jsonEditorService.updateContent(editor.lastActionJson);
    } else {
      // Load the background image file
      reader.onload = function (e) {
        scene.backgroundImage = new Image();
        scene.backgroundImage.src = e.target.result;
        scene.backgroundImage.onload = function (e1) {
          simulator.updateSimulation(true, true);
        }
        scene.backgroundImage.onerror = function (e1) {
          scene.backgroundImage = null;
          error = "openFile: The file is neither a valid JSON scene nor an image file.";
          updateErrorAndWarning();
        }
      }
      reader.readAsDataURL(readFile);
    }
  };

}

function getLink() {
  require('json-url')('lzma').compress(JSON.parse(editor.lastActionJson)).then(output => {
    var fullURL = "https://phydemo.app/ray-optics/simulator/#" + output;
    lastFullURL = fullURL;
    window.history.pushState(undefined, undefined, '#' + output);
    //console.log(fullURL.length);
    navigator.clipboard.writeText(fullURL);
    if (fullURL.length > 2041) {
      alert(i18next.t('simulator:generalWarnings.shareLinkTooLong'));
    } else {
      hasUnsavedChange = false;
    }
  });
}


window.onbeforeunload = function (e) {
  if (hasUnsavedChange) {
    return "You have unsaved change.";
  }
}

function confirmPositioning(ctrl, shift) {
  var xyData = JSON.parse('[' + document.getElementById('xybox').value.replace(/\(|\)/g, '') + ']');
  if (xyData.length == 2) {
    editor.confirmPositioning(xyData[0], xyData[1], ctrl, shift);
  }
}


export const app = {
  initScene,
  initAppService,
  resetDropdownButtons,
  hideWelcome,
  rename,
  save,
  syncUrl,
}