'use strict';

import MainLoop from 'mainloop.js';

export const ToolTypes = {
  TRANSFORM_REFERENCE: 0,
  ADD_POINTS: 1,
  DELETE_POINTS: 2,
  EDIT_POINTS: 3,
  EDIT_CONTROLS: 4,
  EDIT_ORIGIN_POINT: 54,
};

// using string values to make these compatible with input value properties
export const ExportFormats = {
  SVG: 'svg',
  JSON: 'json',
};

export const JSONFormats = {
  COORDS: 'coords',
  ANGLE_DIST: 'angledist',
};

export const storageKey = 'curve-creator';

const canvasWidth = 1024;
const canvasHeight = 768;
const markerSize = 32;
const originSize = 64;
const originSizeHalf = originSize * 0.5;

let canvas, ctx;
let activeTool = ToolTypes.TRANSFORM_REFERENCE;
let mousePos = { x: 0, y: 0 };

class Point {
  x = 0;
  y = 0;
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }
  distanceTo = (point) => {
    const a = this.x - point.x;
    const b = this.y - point.y;

    return Math.sqrt(a * a + b * b);
  };
}

class Control {
  points = [];
  constructor(x1, y1, x2, y2) {
    this.points = [new Point(x1, y1), new Point(x2, y2)];
  }
}

class CurveGroup {
  points = [];
  controls = [];
  id = null;
  constructor(id) {
    this.id = id;
  }
}

class ReferenceImage {
  ready = false;
  data = '';
  image = new Image();
  offset = { x: 0, y: 0 };
  scale = 1;
  dragPosition = { x: 0, y: 0 };
  moving = false;
  scaling = false;
  opacity = 1;
  color = '#ff0099';
  constructor() {
    this.image.onload = () => {
      this.ready = true;
    };
  }
  resetTransforms = () => {
    this.offset = { x: 0, y: 0 };
    this.scale = 1;
  };
  clearData = () => {
    this.setData('');
    this.ready = false;
  };
  getSaveData = () => {
    const size = new Blob([this.data]).size / 1_000_000;

    // there's a limit on the storage space for local storage
    if (size < 4_000_000) {
      return this.data;
    } else {
      return '';
    }
  };
  setData = (data) => {
    this.data = data;
    this.image.src = data;
  };
  setOpacity = (value) => {
    this.opacity = value;
  };
  setColor = (value) => {
    this.color = value;
  };
  setScale = (value) => {
    this.scale = value;
  };
  setOffset = (x, y) => {
    this.offset = { x, y };
  };
  update = () => {
    if (!this.ready) return;

    let scale = this.scale;
    let { x, y } = this.offset;

    if (this.moving || this.scaling) {
      const deltaX = mousePos.x - this.dragPosition.x;
      const deltaY = mousePos.y - this.dragPosition.y;

      if (this.moving) {
        x += deltaX;
        y += deltaY;
      } else if (this.scaling) {
        scale = Math.max(scale - deltaY * 0.01, 0.1);
      }
    }

    const { width, height } = this.image;

    const scaledWidth = width * scale;
    const scaledHeight = height * scale;

    // set opacity
    ctx.globalAlpha = this.opacity;

    // draw the reference image
    ctx.drawImage(this.image, x, y, scaledWidth, scaledHeight);

    // reset opacity
    ctx.globalAlpha = 1;

    // if using the transform tool
    if (activeTool === ToolTypes.TRANSFORM_REFERENCE) {
      // draw outline
      ctx.strokeStyle = this.color;
      ctx.lineWidth = '4';
      ctx.strokeRect(x + 2, y + 2, scaledWidth - 4, scaledHeight - 4);

      ctx.fillStyle = this.color;
      // draw scale markers
      ctx.fillRect(x, y, markerSize, markerSize);
      ctx.fillRect(
        x + scaledWidth - markerSize,
        y + scaledHeight - markerSize,
        markerSize,
        markerSize
      );
    }
  };
  onMouseDown = () => {
    if (!this.ready || activeTool !== ToolTypes.TRANSFORM_REFERENCE) return;

    const { x, y } = this.offset;
    const { width, height } = this.image;

    const scaledWidth = width * this.scale;
    const scaledHeight = height * this.scale;

    // over image
    if (
      mousePos.x > x &&
      mousePos.x < x + scaledWidth &&
      mousePos.y > y &&
      mousePos.y < y + scaledHeight
    ) {
      // over scale marker
      if (
        (mousePos.x < x + markerSize && mousePos.y < y + markerSize) ||
        (mousePos.x > x + scaledWidth - markerSize &&
          mousePos.y > y + scaledHeight - markerSize)
      ) {
        this.scaling = true;
        this.dragPosition = { x: mousePos.x, y: mousePos.y };
      } else {
        this.moving = true;
        this.dragPosition = { x: mousePos.x, y: mousePos.y };
      }
    }
  };
  onMouseUp = () => {
    if (!this.ready) return;

    if (this.moving || this.scaling) {
      const deltaX = mousePos.x - this.dragPosition.x;
      const deltaY = mousePos.y - this.dragPosition.y;

      if (this.moving) {
        this.offset.x += deltaX;
        this.offset.y += deltaY;
      } else if (this.scaling) {
        this.scale = Math.max(this.scale - deltaY * 0.01, 0.1);
      }
      this.moving = false;
      this.scaling = false;
    }
  };
}

export class DrawingHelper {
  curveGroups = [];
  activeCurveGroup = null;
  originPos = { x: 0, y: 0 };

  // display properties
  lineWidth = 2;
  pointSize = 16;
  pointSizeHalf = this.pointSize * 0.5;
  activeOpacity = 1;
  inactiveOpacity = 1;
  mainColor = '#ff0099';
  controlColor = '#ffffff';
  originColor = '#ffffff';

  // range for clicking points
  pointRange = 16;
  pointRangeHalf = this.pointRange * 0.5;

  // output precision
  outputPrecision = 2;

  // drag variables
  dragStart = null;
  dragPoint = null;
  dragControl = null;
  dragOrigin = false;

  // method passed on init for setting output messages
  setMessage = null;
  // reference image instance
  reference = new ReferenceImage();

  init = (_canvas, setMessage) => {
    this.setMessage = setMessage;

    canvas = _canvas;
    ctx = _canvas.getContext('2d');

    _canvas.width = canvasWidth;
    _canvas.height = canvasHeight;

    // add listeners
    document.addEventListener('mousemove', this.handleMouseMove, false);
    document.addEventListener('mousedown', this.handleMouseDown, false);
    document.addEventListener('mouseup', this.handleMouseUp, false);
    document.addEventListener(
      'visibilitychange',
      this.handleVisibilityChange,
      false
    );

    // setup and start main loop
    MainLoop.setUpdate(this.update).start();
  };
  handleVisibilityChange = (event) => {
    if (event.target.visibilityState === 'visible') {
      MainLoop.start();
    } else {
      MainLoop.stop();
    }
  };
  syncLastPoint = () => {
    if (this.activeCurveGroup && this.activeCurveGroup.points.length > 1) {
      const { points } = this.activeCurveGroup;
      const firstPoint = points[0];
      const lastPoint = points[points.length - 1];

      lastPoint.x = firstPoint.x;
      lastPoint.y = firstPoint.y;
    }
  };
  deleteLastPoint = () => {
    if (this.activeCurveGroup && this.activeCurveGroup.points.length > 0) {
      this.activeCurveGroup.points.pop();
      this.activeCurveGroup.controls.pop();
    }
  };
  setActiveTool = (value) => {
    activeTool = value;
  };
  resetReferenceTransforms = () => {
    this.reference.resetTransforms();
  };
  deleteReferenceData = () => {
    this.reference.clearData();
  };
  setReferenceData = (data) => {
    this.reference.setData(data);
  };
  setProperty = (key, value) => {
    this[key] = value;
  };
  setPointRange = (value) => {
    this.pointRange = value;
    this.pointRangeHalf = value * 0.5;
  };
  setPointSize = (value) => {
    this.pointSize = value;
    this.pointSizeHalf = value * 0.5;
  };
  setReferenceOpacity = (value) => {
    this.reference.setOpacity(value);
  };
  setReferenceColor = (value) => {
    this.reference.setColor(value);
  };
  setActiveGroupId = (id) => {
    const foundGroup = this.curveGroups.find((group) => group.id === id);
    if (foundGroup) {
      this.activeCurveGroup = foundGroup;
    } else {
      console.warn(`Unable to find curve group; Id: ${id}`);
    }
  };
  createGroup = (id) => {
    // create new curve group
    const newGroup = new CurveGroup(id);
    this.curveGroups.push(newGroup);
    // set the new group as active
    this.activeCurveGroup = newGroup;
  };
  deleteGroup = (id) => {
    // filter out group
    this.curveGroups = this.curveGroups.filter((group) => group.id !== id);
    // clear the active group if its the one deleted
    if (this.activeCurveGroup?.id === id) {
      this.activeCurveGroup = null;
    }
  };
  loadState = (state) => {
    // origin position
    if (state.originPos !== undefined) {
      this.originPos = state.originPos;
    }
    // curve groups
    if (state.curveGroups !== undefined) {
      this.curveGroups = state.curveGroups.map((group) => {
        const groupInstance = new CurveGroup(group.id);

        // create point instances
        groupInstance.points = group.points.map(({ x, y }) => new Point(x, y));
        // create control instances
        groupInstance.controls = group.controls.map(
          ({ x1, y1, x2, y2 }) => new Control(x1, y1, x2, y2)
        );

        return groupInstance;
      });
    }
    // active group id
    if (state.activeGroupId !== undefined) {
      this.setActiveGroupId(state.activeGroupId);
    }
    // reference
    if (state.reference !== undefined) {
      const { scale, offset, opacity, color, data } = state.reference;
      this.reference.setScale(scale);
      this.reference.setOffset(offset.x, offset.y);
      this.reference.setOpacity(opacity);
      this.reference.setColor(color);

      // possible to save the image
      if (data) {
        this.reference.setData(data);
      }
    }
    // active tool
    if (state.activeTool !== undefined) {
      activeTool = state.activeTool;
    }

    // remaining keys
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
      if (state[key] !== undefined) {
        this.setProperty(key, state[key]);
      }
    });
  };
  saveState = () => {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          timestamp: Date.now(),
          originPos: this.originPos,
          curveGroups: this.curveGroups.map((group) => ({
            id: group.id,
            points: group.points.map(({ x, y }) => ({ x, y })),
            controls: group.controls.map(({ points: [point1, point2] }) => ({
              x1: point1.x,
              y1: point1.y,
              x2: point2.x,
              y2: point2.y,
            })),
          })),
          activeGroupId: this.activeCurveGroup?.id,
          reference: {
            scale: this.reference.scale,
            offset: this.reference.offset,
            opacity: this.reference.opacity,
            color: this.reference.color,
            data: this.reference.getSaveData(),
          },
          activeTool,

          lineWidth: this.lineWidth,
          pointRange: this.pointRange,
          pointSize: this.pointSize,
          activeOpacity: this.activeOpacity,
          inactiveOpacity: this.inactiveOpacity,
          mainColor: this.mainColor,
          controlColor: this.controlColor,
          originColor: this.originColor,
          outputPrecision: this.outputPrecision,
        })
      );
      this.setMessage('Successfully saved state')
      return true;
    } catch (e) {
      this.setMessage(
        'Failed to save the state; check the console for more info'
      );
      console.log(`Failed to save the state; with error: ${e}`);
    }
    return false;
  };
  getSVGString = () => {
    // an svg will be created with each curve group representing a path element
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvasWidth} ${canvasHeight}" fill="none" stroke="${this.mainColor}">`,
      this.curveGroups
        .filter((group) => group.points.length > 1)
        .map(({ points, controls }) => {
          let pathData = [`M${getSVGCoords(points[0], this.outputPrecision)}`];

          // connect all the points via curves
          for (let i = 1; i < points.length; i++) {
            // get the accompanying control
            const [point1, point2] = controls[i - 1].points;
            pathData.push(
              `C${getSVGCoords(point1, this.outputPrecision)}, ${getSVGCoords(
                point2,
                this.outputPrecision
              )}, ${getSVGCoords(points[i], this.outputPrecision)}`
            );
          }

          // join all of the commands with spaces
          return `\t<path d="${pathData.join(' ')}" />`;
        })
        .join('\n'),
      '</svg>',
    ].join('\n');
  };
  getJSONString = (jsonFormat) => {
    if (jsonFormat === JSONFormats.COORDS) {
      return JSON.stringify(
        // map the curve groups
        // convert instances to primitive data
        // adjust for the origin point
        this.curveGroups.map(({ points, controls }) => ({
          points: points.map((point) => {
            const [x, y] = getJSONCoords(
              point,
              this.originPos,
              this.outputPrecision
            );
            return { x, y };
          }),
          controls: controls.map(({ points: [point1, point2] }) => {
            const [x1, y1] = getJSONCoords(
              point1,
              this.originPos,
              this.outputPrecision
            );
            const [x2, y2] = getJSONCoords(
              point2,
              this.originPos,
              this.outputPrecision
            );
            return { x1, y1, x2, y2 };
          }),
        })),
        undefined,
        2
      );
    } else if (jsonFormat === JSONFormats.ANGLE_DIST) {
      return JSON.stringify(
        // map the curve groups
        // convert instances to primitive data
        // adjust for the origin point
        this.curveGroups.map(({ points, controls }) => ({
          points: points.map((point) => {
            const angle = Math.atan2(
              point.y - this.originPos.y,
              point.x - this.originPos.x
            );
            const distance = getPointDistance(point, this.originPos);
            return [
              angle.toFixed(this.outputPrecision),
              distance.toFixed(this.outputPrecision),
            ];
          }),
          controls: controls.map(({ points: [point1, point2] }) => {
            const angle1 = Math.atan2(
              point1.y - this.originPos.y,
              point1.x - this.originPos.x
            );
            const distance1 = getPointDistance(point1, this.originPos);

            const angle2 = Math.atan2(
              point2.y - this.originPos.y,
              point2.x - this.originPos.x
            );
            const distance2 = getPointDistance(point2, this.originPos);

            return [
              angle1.toFixed(this.outputPrecision),
              distance1.toFixed(this.outputPrecision),
              angle2.toFixed(this.outputPrecision),
              distance2.toFixed(this.outputPrecision),
            ];
          }),
        })),
        undefined,
        2
      );
    }
  };
  update = () => {
    try {
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);

      // update reference
      this.reference.update();

      // draw curve groups
      for (let i = 0; i < this.curveGroups.length; i++) {
        const { points, controls, id } = this.curveGroups[i];
        const active = this.activeCurveGroup?.id === id;

        // stop if there are no points
        if (points.length === 0) continue;

        // draw points
        ctx.lineWidth = this.lineWidth;
        ctx.strokeStyle = 'none';
        ctx.fillStyle = this.mainColor;
        ctx.strokeStyle = this.mainColor;

        ctx.beginPath();
        for (let j = 0; j < points.length; j++) {
          let { x, y } = points[j];

          // only if active
          if (active) {
            // use the active opacity
            ctx.globalAlpha = this.activeOpacity;

            // adjust for dragging
            if (activeTool === ToolTypes.EDIT_POINTS) {
              // if this point is being dragged, add the delta to the position
              if (this.dragPoint === j) {
                const deltaX = mousePos.x - this.dragStart.x;
                const deltaY = mousePos.y - this.dragStart.y;

                x += deltaX;
                y += deltaY;
              }
            }

            // draw point itself
            if (
              activeTool === ToolTypes.ADD_POINTS ||
              activeTool === ToolTypes.EDIT_POINTS
            ) {
              // draw a rectangle on the point
              ctx.fillRect(
                x - this.pointSizeHalf,
                y - this.pointSizeHalf,
                this.pointSize,
                this.pointSize
              );
            }

            // draw point line
            if (j === 0) {
              // move if the first point
              ctx.moveTo(x, y);
            } else {
              if (activeTool === ToolTypes.EDIT_CONTROLS) {
                // if editing controls, use this method to account for the points being dragged
                const { x1, y1, x2, y2 } = this.getEditControlPoints(
                  controls[j - 1].points,
                  j - 1
                );
                ctx.bezierCurveTo(x1, y1, x2, y2, x, y);
              } else {
                // render normally
                const [point1, point2] = controls[j - 1].points;
                ctx.bezierCurveTo(point1.x, point1.y, point2.x, point2.y, x, y);
              }
            }
          } else {
            // set inactive opacity
            ctx.globalAlpha = this.inactiveOpacity;

            if (j === 0) {
              // move if the first point
              ctx.moveTo(x, y);
            } else {
              // render normally
              const [point1, point2] = controls[j - 1].points;
              ctx.bezierCurveTo(point1.x, point1.y, point2.x, point2.y, x, y);
            }
          }
        }
        ctx.stroke();

        // only if active
        if (active) {
          // only render the controls when editing controls
          if (activeTool === ToolTypes.EDIT_CONTROLS) {
            // draw control points
            ctx.fillStyle = this.controlColor;
            ctx.strokeStyle = this.controlColor;

            for (let j = 0; j < controls.length; j++) {
              // if editing controls, use this method to account for the points being dragged
              const { x1, y1, x2, y2 } = this.getEditControlPoints(
                controls[j].points,
                j
              );

              // draw outlines around the points
              ctx.strokeRect(
                x1 - this.pointSizeHalf,
                y1 - this.pointSizeHalf,
                this.pointSize,
                this.pointSize
              );
              ctx.strokeRect(
                x2 - this.pointSizeHalf,
                y2 - this.pointSizeHalf,
                this.pointSize,
                this.pointSize
              );

              // draw the connecting line between the two points
              ctx.beginPath();
              ctx.moveTo(x1, y1);
              ctx.lineTo(x2, y2);
              ctx.stroke();
            }
          }
        }
      }

      // reset opacity
      ctx.globalAlpha = 1;

      // draw the origin point
      if (activeTool === ToolTypes.EDIT_ORIGIN_POINT) {
        let { x, y } = this.originPos;
        ctx.lineWidth = 2;
        ctx.strokeStyle = this.originColor;
        ctx.fillStyle = 'none';

        // if the origin is being dragged, add drag delta
        if (this.dragOrigin) {
          const deltaX = mousePos.x - this.dragStart.x;
          const deltaY = mousePos.y - this.dragStart.y;

          x += deltaX;
          y += deltaY;
        }

        ctx.beginPath();
        ctx.moveTo(x, y - originSizeHalf);
        ctx.lineTo(x, y + originSizeHalf);
        ctx.moveTo(x - originSizeHalf, y);
        ctx.lineTo(x + originSizeHalf, y);
        ctx.stroke();
      }
    } catch (e) {
      MainLoop.stop();
      console.log(`MainLoop update failed; with error: ${e}`);
    }
  };
  getEditControlPoints = ([point1, point2], index) => {
    let x1 = point1.x;
    let y1 = point1.y;
    let x2 = point2.x;
    let y2 = point2.y;

    // if one of these control points is being dragged, add the delta to the correct point
    if (this.dragControl) {
      const [controlIndex, pointIndex] = this.dragControl;
      if (controlIndex === index) {
        const deltaX = mousePos.x - this.dragStart.x;
        const deltaY = mousePos.y - this.dragStart.y;

        if (pointIndex === 0) {
          x1 += deltaX;
          y1 += deltaY;
        } else {
          x2 += deltaX;
          y2 += deltaY;
        }
      }
    }

    return { x1, y1, x2, y2 };
  };
  handleMouseMove = (event) => {
    const rect = canvas.getBoundingClientRect();
    mousePos = {
      x: event.clientX - rect.x,
      y: event.clientY - rect.y,
    };
  };
  handleMouseDown = () => {
    const mouseX = mousePos.x;
    const mouseY = mousePos.y;

    switch (activeTool) {
      case ToolTypes.ADD_POINTS: {
        if (!this.activeCurveGroup) {
          this.setMessage(
            'Cannot add point; Please create or select a curve group before adding points.'
          );
          return;
        }

        if (
          mouseX < 0 ||
          mouseX > canvasWidth ||
          mouseY < 0 ||
          mouseY > canvasHeight
        )
          return;

        // create a new point
        this.activeCurveGroup.points.push(new Point(mouseX, mouseY));

        const { points } = this.activeCurveGroup;
        // every point after the first will create control points
        if (points.length > 1) {
          // get the last two points, including the one that was just created
          const [point1, point2] = points.slice(points.length - 2);

          const angle = Math.atan2(point2.y - point1.y, point2.x - point1.x);
          const distance = point1.distanceTo(point2);

          const x1 = point1.x + Math.cos(angle) * distance * 0.2;
          const y1 = point1.y + Math.sin(angle) * distance * 0.2;
          const x2 = point1.x + Math.cos(angle) * distance * 0.8;
          const y2 = point1.y + Math.sin(angle) * distance * 0.8;

          // create a control point
          this.activeCurveGroup.controls.push(new Control(x1, y1, x2, y2));
        }
        break;
      }
      case ToolTypes.EDIT_POINTS: {
        if (!this.activeCurveGroup) return;

        const { points } = this.activeCurveGroup;

        // search for points
        for (let i = 0; i < points.length; i++) {
          const { x, y } = points[i];
          if (
            mouseX > x - this.pointRangeHalf &&
            mouseX < x + this.pointRangeHalf &&
            mouseY > y - this.pointRangeHalf &&
            mouseY < y + this.pointRangeHalf
          ) {
            // store the point index
            this.dragPoint = i;
            this.dragStart = { x: mouseX, y: mouseY };
            break;
          }
        }
        break;
      }
      case ToolTypes.EDIT_CONTROLS: {
        if (!this.activeCurveGroup) return;

        const { controls } = this.activeCurveGroup;

        // search for control points
        for (let i = 0; i < controls.length; i++) {
          const { points } = controls[i];
          for (let j = 0; j < 2; j++) {
            const { x, y } = points[j];
            if (
              mouseX > x - this.pointRangeHalf &&
              mouseX < x + this.pointRangeHalf &&
              mouseY > y - this.pointRangeHalf &&
              mouseY < y + this.pointRangeHalf
            ) {
              // store the control index and control point index
              this.dragControl = [i, j];
              this.dragStart = { x: mouseX, y: mouseY };
              break;
            }
          }
        }
        break;
      }
      case ToolTypes.EDIT_ORIGIN_POINT: {
        if (
          mouseX > this.originPos.x - originSizeHalf &&
          mouseX < this.originPos.x + originSizeHalf &&
          mouseY > this.originPos.y - originSizeHalf &&
          mouseY < this.originPos.y + originSizeHalf
        ) {
          this.dragOrigin = true;
          this.dragStart = { x: mouseX, y: mouseY };
        }
        break;
      }
    }

    // call reference method
    this.reference.onMouseDown();
  };
  handleMouseUp = () => {
    const mouseX = mousePos.x;
    const mouseY = mousePos.y;

    switch (activeTool) {
      case ToolTypes.EDIT_POINTS: {
        // if there's no active group or not dragging
        if (!this.activeCurveGroup || this.dragPoint === null) return;

        // commit drag changes
        const deltaX = mouseX - this.dragStart.x;
        const deltaY = mouseY - this.dragStart.y;

        // look up the point being dragged
        const point = this.activeCurveGroup.points[this.dragPoint];
        point.x += deltaX;
        point.y += deltaY;

        // clear drag point
        this.dragPoint = null;
        this.dragStart = null;
        break;
      }
      case ToolTypes.EDIT_CONTROLS: {
        // if there's no active group or not dragging
        if (!this.activeCurveGroup || this.dragControl === null) return;

        // commit drag changes
        const deltaX = mouseX - this.dragStart.x;
        const deltaY = mouseY - this.dragStart.y;

        // look up the control point being dragged
        const [controlIndex, pointIndex] = this.dragControl;
        const control = this.activeCurveGroup.controls[controlIndex];
        control.points[pointIndex].x += deltaX;
        control.points[pointIndex].y += deltaY;

        // clear drag control
        this.dragControl = null;
        this.dragStart = null;
        break;
      }
      case ToolTypes.EDIT_ORIGIN_POINT: {
        if (this.dragOrigin) {
          // commit drag changes
          const deltaX = mouseX - this.dragStart.x;
          const deltaY = mouseY - this.dragStart.y;

          this.originPos.x += deltaX;
          this.originPos.y += deltaY;

          // clear drag origin
          this.dragOrigin = false;
          this.dragStart = null;
        }
        break;
      }
    }

    // call reference method
    this.reference.onMouseUp();
  };
}

function getPointDistance(point1, point2) {
  const a = point1.x - point2.x;
  const b = point1.y - point2.y;

  return Math.sqrt(a * a + b * b);
}

function getSVGCoords({ x, y }, precision) {
  return `${y.toFixed(precision)} ${x.toFixed(precision)}`;
}

function getJSONCoords({ x, y }, originPos, precision) {
  return [
    (x - originPos.x).toFixed(precision),
    (y - originPos.y).toFixed(precision),
  ];
}
