import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
  PencilIcon,
  PencilSquareIcon,
  PlusIcon,
  ScissorsIcon,
  TrashIcon,
} from '@heroicons/react/24/solid';
import { nanoid } from 'nanoid';
import cx from 'classnames';
import { Button, FileInput, Label, Radio, TextInput } from 'flowbite-react';
import copy from 'copy-to-clipboard';
import { saveAs } from 'file-saver';
import produce from 'immer';

import {
  DrawingHelper,
  ToolTypes,
  ExportFormats,
  JSONFormats,
  storageKey,
} from '../../classes/DrawingHelper';
import { TimeAgo } from '../TimeAgo/TimeAgo';

import styles from './App.module.css';

const drawing = new DrawingHelper();

const ToolButton = ({ children, title, active, type, onClick }) => (
  <Button
    className="mb-2"
    title={title}
    outline={!active}
    size="sm"
    onClick={() => onClick(type)}
  >
    {children}
  </Button>
);

export const App = () => {
  const canvasRef = useRef();
  const fileRef = useRef();

  const [curveGroupIds, setCurveGroupIds] = useState([]);
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [exportFormat, setExportFormat] = useState(ExportFormats.SVG);
  const [jsonFormat, setJSONFormat] = useState(JSONFormats.ANGLE_DIST);
  const [message, setMessage] = useState('¯\\_(ツ)_/¯');
  const [activeTool, setActiveTool] = useState(ToolTypes.TRANSFORM_REFERENCE);
  const [lastSave, setLastSave] = useState(null);

  const [fields, setFields] = useState({
    lineWidth: '2',
    pointRange: '16',
    pointSize: '16',
    activeOpacity: '1',
    inactiveOpacity: '1',
    mainColor: '#ff0099',
    controlColor: '#ffffff',
    originColor: '#ffffff',
    referenceOpacity: '1',
    referenceColor: '#ff0099',
    outputPrecision: '2',
  });

  // initialize the drawing helper
  useEffect(() => {
    window.onbeforeunload = () => {
      if (!import.meta.env.DEV) {
        return 'Are you sure you want to leave the page?  Un-saved changes will be lost.';
      }
    };

    drawing.init(canvasRef.current, setMessage);

    // attempt to load a previous program state
    const state = localStorage.getItem(storageKey);
    if (state) {
      try {
        const json = JSON.parse(state);

        // timestamp
        if (json.timestamp !== undefined) {
          setLastSave(json.timestamp);
        }
        // curve groups
        if (json.curveGroups !== undefined) {
          setCurveGroupIds(json.curveGroups.map(({ id }) => id));
        }
        // active group id
        if (json.activeGroupId !== undefined) {
          setActiveGroupId(json.activeGroupId);
        }
        // active tool
        if (json.activeTool !== undefined) {
          setActiveTool(json.activeTool);
        }

        // values that are part of the fields object
        setFields(
          produce((draft) => {
            // the reference properties are nested
            if (json.reference !== undefined) {
              draft.referenceOpacity = json.reference.opacity;
              draft.referenceColor = json.reference.color;
            }
            // iterate over all the remaining fields
            [
              'lineWidth',
              'pointRange',
              'pointSize',
              'activeOpacity',
              'inactiveOpacity',
              'mainColor',
              'controlColor',
              'originColor',
              'outputPrecision',
            ].forEach((key) => {
              if (json[key] !== undefined) {
                // set field, all fields should be string values
                draft[key] = String(json[key]);
              }
            });
          })
        );

        drawing.loadState(json);
      } catch (e) {
        setMessage(
          'Failed to load saved state; check the console for more info'
        );
        console.log(`Failed to load saved state; with error: ${e}`);
      }
    }
  }, []);

  const handleFileChange = async (event) => {
    try {
      // if there's no file for some reason
      if (!event.target.files[0]) return;

      const reader = new FileReader();
      reader.onload = ({ target: { result } }) => {
        drawing.setReferenceData(result);
      };
      reader.readAsDataURL(event.target.files[0]);
    } catch (e) {
      console.log(`File upload failed; with error: ${e}`);
    }
  };

  const handleDeleteImageClick = () => {
    fileRef.current.value = '';
    // sync drawing instance
    drawing.deleteReferenceData();
  };

  const handleResetImageClick = () => {
    // sync drawing instance
    drawing.resetReferenceTransforms();
  };

  const handleToolClick = (type) => {
    setActiveTool(type);
    // sync drawing instance
    drawing.setActiveTool(type);
  };

  const handleNewGroupClick = () => {
    // create new group id
    const groupId = nanoid(10);
    setCurveGroupIds(curveGroupIds.concat(groupId));
    // switch to the add points tool
    handleToolClick(ToolTypes.ADD_POINTS);
    // mark the new group as active
    setActiveGroupId(groupId);

    // sync drawing instance
    drawing.createGroup(groupId);
  };

  const handleCurveGroupClick = (id) => {
    setActiveGroupId(id);

    // sync drawing instance
    drawing.setActiveGroupId(id);
  };

  const handleGroupDeleteClick = (event, id) => {
    // prevent bubbling the click to the row
    event.stopPropagation();

    if (activeGroupId === id) {
      setActiveGroupId(null);
    }

    setCurveGroupIds(curveGroupIds.filter((groupId) => groupId !== id));
    // sync drawing instance
    drawing.deleteGroup(id);
  };

  const handleDeleteLastClick = () => {
    // sync drawing instance
    drawing.deleteLastPoint();
  };

  const handleSyncLastClick = () => {
    // sync drawing instance
    drawing.syncLastPoint();
  };

  const handleFieldChange = (key, { target: { value } }) => {
    setFields(
      produce((draft) => {
        draft[key] = value;
      })
    );
    // sync drawing instance
    drawing.setProperty(key, value);
  };

  const handleNumberFieldChange = (key, { target: { value } }) => {
    setFields(
      produce((draft) => {
        draft[key] = value;
      })
    );
    // sync drawing instance
    drawing.setProperty(key, value);
  };

  const handlePointRangeChange = ({ target: { value } }) => {
    setFields(
      produce((draft) => {
        draft.pointRange = value;
      })
    );
    // sync drawing instance
    drawing.setPointRange(Number(value));
  };

  const handlePointSizeChange = ({ target: { value } }) => {
    setFields(
      produce((draft) => {
        draft.pointSize = value;
      })
    );
    // sync drawing instance
    drawing.setPointSize(Number(value));
  };

  const handleReferenceOpacityChange = ({ target: { value } }) => {
    setFields(
      produce((draft) => {
        draft.referenceOpacity = value;
      })
    );
    // sync drawing instance
    drawing.setReferenceOpacity(Number(value));
  };

  const handleReferenceColorChange = ({ target: { value } }) => {
    setFields(
      produce((draft) => {
        draft.referenceColor = value;
      })
    );
    // sync drawing instance
    drawing.setReferenceColor(Number(value));
  };

  const handleExportFormatChange = (event) => {
    setExportFormat(event.target.value);
  };

  const handleJSONFormatChange = (event) => {
    setJSONFormat(event.target.value);
  };

  const handleCopyClipboardClick = () => {
    if (exportFormat === ExportFormats.SVG) {
      copy(drawing.getSVGString());
      setMessage('Copied SVG to clipboard');
    } else if (exportFormat === ExportFormats.JSON) {
      copy(drawing.getJSONString(jsonFormat));
      setMessage('Copied JSON to clipboard');
    }
  };

  const handleDownloadClick = () => {
    if (exportFormat === ExportFormats.SVG) {
      saveAs(
        new Blob([drawing.getSVGString()], {
          type: 'text/plain;charset=utf-8',
        }),
        'curve.svg'
      );
    } else if (exportFormat === ExportFormats.JSON) {
      saveAs(
        new Blob([drawing.getJSONString(jsonFormat)], {
          type: 'text/plain;charset=utf-8',
        }),
        'curve.json'
      );
    }
  };

  const handleSaveStateClick = () => {
    // sync drawing instance
    if (drawing.saveState()) {
      setLastSave(Date.now());
    }
  };

  const handleClearStateClick = () => {
    if (window.confirm('Are you sure you want to clear the saved state?')) {
      localStorage.clear();
    }
  };

  return (
    <div className="flex justify-between overflow-hidden h-full">
      <div className={styles.sidebar}>
        <div className="mb-8">
          <div className="text-xl mb-4">Curves</div>
          <div className="border border-gray-700 rounded overflow-y-auto mb-4 text-sm">
            {curveGroupIds.length > 0 ? (
              curveGroupIds.map((id, index) => (
                <div
                  key={id}
                  className={cx(
                    { 'bg-blue-700': activeGroupId === id },
                    {
                      'hover:bg-blue-800 even:bg-gray-700':
                        activeGroupId !== id,
                    },
                    'px-2 py-1 cursor-pointer flex items-center justify-between'
                  )}
                  onClick={() => handleCurveGroupClick(id)}
                >
                  <span>Group {index}</span>
                  {activeGroupId === id && (
                    <div
                      className="border border-gray-400 rounded p-1 hover:opacity-50 transition-opacity"
                      onClick={(event) => handleGroupDeleteClick(event, id)}
                    >
                      <TrashIcon width={16} height={16} />
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="px-2 py-1 text-gray-400">No curve groups</div>
            )}
          </div>
          <div>
            <Button size="sm" onClick={handleNewGroupClick}>
              New Group
            </Button>
          </div>
        </div>
        <div className="mb-8">
          <div className="text-xl mb-4">Points</div>
          <div className="flex gap-4">
            <Button
              fullSized
              color="dark"
              size="sm"
              onClick={handleSyncLastClick}
              title="Sync the last point's position to the first"
            >
              Sync Last
            </Button>
            <Button
              fullSized
              color="dark"
              size="sm"
              onClick={handleDeleteLastClick}
              title="Delete the last point"
            >
              Delete Last
            </Button>
          </div>
        </div>
        <div className="mb-8">
          <div className="text-xl mb-4">Display</div>
          <div className="mb-1">
            <Label>Line Width</Label>
            <TextInput
              value={fields.lineWidth}
              onChange={(event) => handleNumberFieldChange('lineWidth', event)}
              sizing="sm"
              type="number"
              min="1"
            />
          </div>
          <div className="flex gap-4">
            <div>
              <Label>Point Range</Label>
              <TextInput
                value={fields.pointRange}
                onChange={handlePointRangeChange}
                sizing="sm"
                type="number"
                min="1"
                title="The range you need to be within when clicking a point/control point"
              />
            </div>
            <div>
              <Label>Point Size</Label>
              <TextInput
                value={fields.pointSize}
                onChange={handlePointSizeChange}
                sizing="sm"
                type="number"
                min="1"
              />
            </div>
          </div>
          <div className="flex gap-4">
            <div>
              <Label>Active Opacity</Label>
              <TextInput
                value={fields.activeOpacity}
                onChange={(event) =>
                  handleNumberFieldChange('activeOpacity', event)
                }
                sizing="sm"
                type="number"
                min="0"
                max="1"
                step="0.1"
              />
            </div>
            <div>
              <Label>Inactive Opacity</Label>
              <TextInput
                value={fields.inactiveOpacity}
                onChange={(event) =>
                  handleNumberFieldChange('inactiveOpacity', event)
                }
                sizing="sm"
                type="number"
                min="0"
                max="1"
                step="0.1"
              />
            </div>
          </div>
          <div className="flex gap-4">
            <div>
              <Label>Main Color</Label>
              <TextInput
                value={fields.mainColor}
                onChange={(event) => handleFieldChange('mainColor', event)}
                sizing="sm"
              />
            </div>
            <div>
              <Label>Control Color</Label>
              <TextInput
                value={fields.controlColor}
                onChange={(event) => handleFieldChange('controlColor', event)}
                sizing="sm"
              />
            </div>
          </div>
          <div>
            <Label>Origin Color</Label>
            <TextInput
              value={fields.originColor}
              onChange={(event) => handleFieldChange('originColor', event)}
              sizing="sm"
            />
          </div>
        </div>
        <div className="mb-8">
          <div className="text-xl mb-4">Reference Image</div>
          <div className="mb-4">
            <FileInput ref={fileRef} onChange={handleFileChange} />
          </div>
          <div className="flex gap-4 mb-4">
            <div>
              <Label>Opacity</Label>
              <TextInput
                value={fields.referenceOpacity}
                onChange={handleReferenceOpacityChange}
                sizing="sm"
                type="number"
                min="0"
                max="1"
                step="0.1"
              />
            </div>
            <div>
              <Label>Color</Label>
              <TextInput
                value={fields.referenceColor}
                onChange={handleReferenceColorChange}
                sizing="sm"
              />
            </div>
          </div>
          <div className="flex gap-4">
            <Button
              fullSized
              color="dark"
              size="sm"
              onClick={handleDeleteImageClick}
              title="Delete image"
            >
              Delete
            </Button>
            <Button
              fullSized
              color="dark"
              size="sm"
              onClick={handleResetImageClick}
              title="Reset transforms"
            >
              Reset
            </Button>
          </div>
        </div>
        <div className="mb-8">
          <div className="text-xl mb-4">Export</div>
          <div className="flex flex-col gap-4 mb-4">
            <fieldset className="flex flex-col">
              <legend>Format</legend>
              <div className="flex items-center gap-2">
                <Radio
                  id="format-svg"
                  value={ExportFormats.SVG}
                  checked={exportFormat === ExportFormats.SVG}
                  onChange={handleExportFormatChange}
                />
                <Label htmlFor="format-svg">SVG</Label>
              </div>
              <div className="flex items-center gap-2">
                <Radio
                  id="format-json"
                  value={ExportFormats.JSON}
                  checked={exportFormat === ExportFormats.JSON}
                  onChange={handleExportFormatChange}
                />
                <Label htmlFor="format-json">JSON</Label>
              </div>
            </fieldset>
            {exportFormat === ExportFormats.JSON && (
              <fieldset className="flex flex-col">
                <legend>JSON-Format</legend>
                <div className="flex items-center gap-2">
                  <Radio
                    id="jsonformat-coords"
                    name="export-json-format"
                    value={JSONFormats.COORDS}
                    checked={jsonFormat === JSONFormats.COORDS}
                    onChange={handleJSONFormatChange}
                  />
                  <Label htmlFor="jsonformat-coords">Coordinates</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Radio
                    id="jsonformat-angledist"
                    name="export-json-format"
                    value={JSONFormats.ANGLE_DIST}
                    checked={jsonFormat === JSONFormats.ANGLE_DIST}
                    onChange={handleJSONFormatChange}
                  />
                  <Label htmlFor="jsonformat-angledist">
                    Angle-Distance Pairs
                  </Label>
                </div>
              </fieldset>
            )}
          </div>
          <div className="mb-4">
            <Label>Precision</Label>
            <TextInput
              value={fields.outputPrecision}
              onChange={(event) =>
                handleNumberFieldChange('outputPrecision', event)
              }
              sizing="sm"
              type="number"
              min="0"
              step="1"
            />
          </div>
          <div className="mb-4 flex gap-4">
            <Button
              fullSized
              size="sm"
              onClick={handleCopyClipboardClick}
              title="Copy export data to the clipboard"
            >
              Copy to Clipboard
            </Button>
            <Button
              fullSized
              size="sm"
              onClick={handleDownloadClick}
              title="Download export data"
            >
              Download
            </Button>
          </div>
          <div className="mb-4">
            <div className="mb-2 flex gap-4">
              <Button
                fullSized
                color="dark"
                size="sm"
                onClick={handleSaveStateClick}
                title="Save the current program's state to local storage"
              >
                Save State
              </Button>
              <Button
                fullSized
                color="dark"
                size="sm"
                onClick={handleClearStateClick}
                title="Clear saved state from local storage"
              >
                Clear Saved State
              </Button>
            </div>
            <div className="text-sm text-gray-400 flex gap-2">
              <span>Last saved:</span>
              <span>
                {lastSave ? <TimeAgo timestamp={lastSave} /> : 'Never'}
              </span>
            </div>
          </div>
        </div>
      </div>
      <div className="py-8 flex-1 flex relative border-l border-gray-700">
        <div className="mx-4">
          <ToolButton
            title="Transform reference image"
            active={activeTool === ToolTypes.TRANSFORM_REFERENCE}
            type={ToolTypes.TRANSFORM_REFERENCE}
            onClick={handleToolClick}
          >
            <ArrowsPointingOutIcon width={20} height={20} />
          </ToolButton>
          <ToolButton
            title="Add points"
            active={activeTool === ToolTypes.ADD_POINTS}
            type={ToolTypes.ADD_POINTS}
            onClick={handleToolClick}
          >
            <PlusIcon width={20} height={20} />
          </ToolButton>
          {/* <ToolButton
            title="Delete points"
            active={activeTool === ToolTypes.DELETE_POINTS}
            type={ToolTypes.DELETE_POINTS}
            onClick={handleToolClick}
          >
            <ScissorsIcon width={20} height={20} />
          </ToolButton> */}
          <ToolButton
            title="Edit points"
            active={activeTool === ToolTypes.EDIT_POINTS}
            type={ToolTypes.EDIT_POINTS}
            onClick={handleToolClick}
          >
            <PencilIcon width={20} height={20} />
          </ToolButton>
          <ToolButton
            title="Edit controls"
            active={activeTool === ToolTypes.EDIT_CONTROLS}
            type={ToolTypes.EDIT_CONTROLS}
            onClick={handleToolClick}
          >
            <PencilSquareIcon width={20} height={20} />
          </ToolButton>
          <ToolButton
            title="Edit origin point"
            active={activeTool === ToolTypes.EDIT_ORIGIN_POINT}
            type={ToolTypes.EDIT_ORIGIN_POINT}
            onClick={handleToolClick}
          >
            <ArrowsPointingInIcon width={20} height={20} />
          </ToolButton>
        </div>
        <canvas ref={canvasRef} className="border border-gray-700 mb-auto" />
        <div className="absolute bottom-0 w-full bg-neutral-800 p-2 text-gray-400 font-mono text-sm flex gap-4">
          <span>
            <b>Last Message:</b>
          </span>
          <span>{message ? message : 'None'}</span>
        </div>
      </div>
    </div>
  );
};
