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

import PointSource from '../../../src/simulator/js/sceneObjs/lightSource/PointSource';
import Scene from '../../../src/simulator/js/Scene';
import { MockUser } from '../helpers/test-utils';

describe('PointSource', () => {
  let scene;
  let obj;
  let user;

  beforeEach(() => {
    scene = new Scene();
    obj = new PointSource(scene);
    user = new MockUser(obj);
  });

  it('creates with one click', () => {
    user.click(101, 102);
    expect(obj.serialize()).toEqual({
      type: 'PointSource',
      x: 101,
      y: 102
    });
  });

  it('creates with grid snapping', () => {
    user.setScene('snapToGrid', true);
    user.click(101, 102);
    expect(obj.serialize()).toEqual({
      type: 'PointSource',
      x: 100,
      y: 100
    });
  });

  it('hovers with mouse', () => {
    user.click(100, 100);
    expect(user.hover(101, 101)).toBeTruthy();
    expect(user.hover(150, 150)).toBeFalsy();
  });

  it('drags with mouse', () => {
    user.click(100, 100);
    user.drag(101, 101, 200, 200);
    expect(obj.serialize()).toEqual({
      type: 'PointSource',
      x: 200,
      y: 200
    });
  });

  it('drags with grid snapping', () => {
    user.click(100, 100);
    user.setScene('snapToGrid', true);
    user.drag(101, 101, 201, 201);
    expect(obj.serialize()).toEqual({
      type: 'PointSource',
      x: 200,
      y: 200
    });
  });

  it('shift + drags horizontally', () => {
    user.click(100, 100);
    user.shiftDrag(101, 101, 200, 110);
    expect(obj.serialize()).toEqual({
      type: 'PointSource',
      x: 200,
      y: 100
    });
  });

  it('shift + drags vertically', () => {
    user.click(100, 100);
    user.shiftDrag(101, 101, 110, 200);
    expect(obj.serialize()).toEqual({
      type: 'PointSource',
      x: 100,
      y: 200
    });
  });

  it('moves by a vector', () => {
    user.click(100, 100);
    user.move(50, 100);
    expect(obj.serialize()).toEqual({
      type: 'PointSource',
      x: 150,
      y: 200
    });
  });

  it('sets properties for non-simulateColors', () => {
    user.click(100, 100);
    user.set("{{simulator:sceneObjs.common.brightness}}", 0.3);
    expect(user.get("{{simulator:sceneObjs.common.wavelength}}")).toBeNull();
  });

  it('sets properties for simulateColors', () => {
    user.click(100, 100);
    user.setScene('simulateColors', true);

    user.set("{{simulator:sceneObjs.common.brightness}}", 0.3);
    user.set("{{simulator:sceneObjs.common.wavelength}}", 500);

    expect(obj.serialize()).toEqual({
      type: 'PointSource',
      x: 100,
      y: 100,
      brightness: 0.3,
      wavelength: 500
    });
  });
}); 