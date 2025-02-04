"use strict";

function parseOBJ(text) {
  // because indices are base 1 let's just fill in the 0th data
  const objPositions = [[0, 0, 0]];
  const objTexcoords = [[0, 0]];
  const objNormals = [[0, 0, 0]];
  const objColors = [[0, 0, 0]];

  // same order as `f` indices
  const objVertexData = [
    objPositions,
    objTexcoords,
    objNormals,
    objColors,
  ];

  // same order as `f` indices
  let webglVertexData = [
    [],   // positions
    [],   // texcoords
    [],   // normals
    [],   // colors
  ];

  const materialLibs = [];
  const geometries = [];
  let geometry;
  let groups = ['default'];
  let material = 'default';
  let object = 'default';

  const noop = () => {};

  function newGeometry() {
    // If there is an existing geometry and it's
    // not empty then start a new one.
    if (geometry && geometry.data.position.length) {
      geometry = undefined;
    }
  }

  function setGeometry() {
    if (!geometry) {
      const position = [];
      const texcoord = [];
      const normal = [];
      const color = [];
      webglVertexData = [
        position,
        texcoord,
        normal,
        color,
      ];
      geometry = {
        object,
        groups,
        material,
        data: {
          position,
          texcoord,
          normal,
          color,
        },
      };
      geometries.push(geometry);
    }
  }

  function addVertex(vert) {
    const ptn = vert.split('/');
    ptn.forEach((objIndexStr, i) => {
      if (!objIndexStr) {
        return;
      }
      const objIndex = parseInt(objIndexStr);
      const index = objIndex + (objIndex >= 0 ? 0 : objVertexData[i].length);
      webglVertexData[i].push(...objVertexData[i][index]);
      // if this is the position index (index 0) and we parsed
      // vertex colors then copy the vertex colors to the webgl vertex color data
      if (i === 0 && objColors.length > 1) {
        geometry.data.color.push(...objColors[index]);
      }
    });
  }

  const keywords = {
    v(parts) {
      // if there are more than 3 values here they are vertex colors
      if (parts.length > 3) {
        objPositions.push(parts.slice(0, 3).map(parseFloat));
        objColors.push(parts.slice(3).map(parseFloat));
      } else {
        objPositions.push(parts.map(parseFloat));
      }
    },
    vn(parts) {
      objNormals.push(parts.map(parseFloat));
    },
    vt(parts) {
      // should check for missing v and extra w?
      objTexcoords.push(parts.map(parseFloat));
    },
    f(parts) {
      setGeometry();
      const numTriangles = parts.length - 2;
      for (let tri = 0; tri < numTriangles; ++tri) {
        addVertex(parts[0]);
        addVertex(parts[tri + 1]);
        addVertex(parts[tri + 2]);
      }
    },
    s: noop,    // smoothing group
    mtllib(parts, unparsedArgs) {
      // the spec says there can be multiple filenames here
      // but many exist with spaces in a single filename
      materialLibs.push(unparsedArgs);
    },
    usemtl(parts, unparsedArgs) {
      material = unparsedArgs;
      newGeometry();
    },
    g(parts) {
      groups = parts;
      newGeometry();
    },
    o(parts, unparsedArgs) {
      object = unparsedArgs;
      newGeometry();
    },
  };

  const keywordRE = /(\w*)(?: )*(.*)/;
  const lines = text.split('\n');
  for (let lineNo = 0; lineNo < lines.length; ++lineNo) {
    const line = lines[lineNo].trim();
    if (line === '' || line.startsWith('#')) {
      continue;
    }
    const m = keywordRE.exec(line);
    if (!m) {
      continue;
    }
    const [, keyword, unparsedArgs] = m;
    const parts = line.split(/\s+/).slice(1);
    const handler = keywords[keyword];
    if (!handler) {
      console.warn('unhandled keyword:', keyword);  // eslint-disable-line no-console
      continue;
    }
    handler(parts, unparsedArgs);
  }

  // remove any arrays that have no entries.
  for (const geometry of geometries) {
    geometry.data = Object.fromEntries(
        Object.entries(geometry.data).filter(([, array]) => array.length > 0));
  }

  return {
    geometries,
    materialLibs,
  };
}

function parseMapArgs(unparsedArgs) {
  // TODO: handle options
  return unparsedArgs;
}

function parseMTL(text) {
  const materials = {};
  let material;

  const keywords = {
    newmtl(parts, unparsedArgs) {
      material = {};
      materials[unparsedArgs] = material;
    },
    /* eslint brace-style:0 */
    Ns(parts)       { material.shininess      = parseFloat(parts[0]); },
    Ka(parts)       { material.ambient        = parts.map(parseFloat); },
    Kd(parts)       { material.diffuse        = parts.map(parseFloat); },
    Ks(parts)       { material.specular       = parts.map(parseFloat); },
    Ke(parts)       { material.emissive       = parts.map(parseFloat); },
    map_Kd(parts, unparsedArgs)   { material.diffuseMap = parseMapArgs(unparsedArgs); },
    map_Ns(parts, unparsedArgs)   { material.specularMap = parseMapArgs(unparsedArgs); },
    map_Bump(parts, unparsedArgs) { material.normalMap = parseMapArgs(unparsedArgs); },
    Ni(parts)       { material.opticalDensity = parseFloat(parts[0]); },
    d(parts)        { material.opacity        = parseFloat(parts[0]); },
    illum(parts)    { material.illum          = parseInt(parts[0]); },
  };

  const keywordRE = /(\w*)(?: )*(.*)/;
  const lines = text.split('\n');
  for (let lineNo = 0; lineNo < lines.length; ++lineNo) {
    const line = lines[lineNo].trim();
    if (line === '' || line.startsWith('#')) {
      continue;
    }
    const m = keywordRE.exec(line);
    if (!m) {
      continue;
    }
    const [, keyword, unparsedArgs] = m;
    const parts = line.split(/\s+/).slice(1);
    const handler = keywords[keyword];
    if (!handler) {
      console.warn('unhandled keyword:', keyword);  // eslint-disable-line no-console
      continue;
    }
    handler(parts, unparsedArgs);
  }

  return materials;
}

async function main() {
  // Get A WebGL context
  /** @type {HTMLCanvasElement} */
  const canvas = document.querySelector("#canvas");
  const gl = canvas.getContext("webgl2");
  if (!gl) {
    return;
  }

  // Tell the twgl to match position with a_position etc..
  twgl.setAttributePrefix("a_");

  const vs = `#version 300 es
  in vec4 a_position;
  in vec3 a_normal;
  in vec2 a_texcoord;
  in vec4 a_color;

  uniform mat4 u_projection;
  uniform mat4 u_view;
  uniform mat4 u_world;
  uniform vec3 u_viewWorldPosition;

  out vec3 v_normal;
  out vec3 v_surfaceToView;
  out vec2 v_texcoord;
  out vec4 v_color;

  void main() {
    vec4 worldPosition = u_world * a_position;
    gl_Position = u_projection * u_view * worldPosition;
    v_surfaceToView = u_viewWorldPosition - worldPosition.xyz;
    v_normal = mat3(u_world) * a_normal;
    v_texcoord = a_texcoord;
    v_color = a_color;
  }
  `;

  const fs = `#version 300 es
  precision highp float;

  in vec3 v_normal;
  in vec3 v_surfaceToView;
  in vec2 v_texcoord;
  in vec4 v_color;

  uniform vec3 diffuse;
  uniform sampler2D diffuseMap;
  uniform vec3 ambient;
  uniform vec3 emissive;
  uniform vec3 specular;
  uniform float shininess;
  uniform float opacity;
  uniform vec3 u_lightDirection;
  uniform vec3 u_ambientLight;

  out vec4 outColor;

  void main () {
    vec3 normal = normalize(v_normal);

    vec3 surfaceToViewDirection = normalize(v_surfaceToView);
    vec3 halfVector = normalize(u_lightDirection + surfaceToViewDirection);

    float fakeLight = dot(u_lightDirection, normal) * .5 + .5;
    float specularLight = clamp(dot(normal, halfVector), 0.0, 1.0);

    vec4 diffuseMapColor = texture(diffuseMap, v_texcoord);
    vec3 effectiveDiffuse = diffuse * diffuseMapColor.rgb * v_color.rgb;
    float effectiveOpacity = opacity * diffuseMapColor.a * v_color.a;

    outColor = vec4(
        emissive +
        ambient * u_ambientLight +
        effectiveDiffuse * fakeLight +
        specular * pow(specularLight, shininess),
        effectiveOpacity);
  }
  `;

  // compiles and links the shaders, looks up attribute and uniform locations
  const meshProgramInfo = twgl.createProgramInfo(gl, [vs, fs]);

  let objHref = ["obj\\trafficlight_C.obj", 
    "obj\\streetlight.obj",
    "obj\\building_B.obj", 
    "obj\\building_D.obj", 
    "obj\\road_straight.obj", 
    "obj\\car_police.obj", 
    "obj\\car_hatchback.obj", 
    "obj\\road_corner.obj", 
    "obj\\road_straight_crossing.obj", 
    "obj\\road_tsplit.obj", 
    "obj\\building_F.obj", 
    "obj\\building_H.obj"];

  let response = [];
  let text = [];
  let obj = [];
  let baseHref = [];
  let matTexts = [];
  let matHref = [];
  let range = 0;
  let parts = [];
  let extents = 0;
 
  for( let i = 0; i < 12; i++ ) {

    response[i] = await fetch(objHref[i]);
    text[i] = await response[i].text();
    obj[i] = parseOBJ(text[i]);
    baseHref[i] = new URL(objHref[i], window.location.href);
    matTexts[i] = await Promise.all(obj[i].materialLibs.map(async filename => {
    matHref[i] = new URL(filename, baseHref[i]).href;
    response[i] = await fetch(matHref[i]);
    return await response[i].text();
  }));
  let materials = parseMTL(matTexts[i].join('\n'));

  let textures = {
    defaultWhite: twgl.createTexture(gl, {src: [255, 255, 255, 255]}),
  };

  // Carrega texturas para materiais
  for (const material of Object.values(materials)) {
    Object.entries(material)
      .filter(([key]) => key.endsWith('Map'))
      .forEach(([key, filename]) => {
        let texture = textures[filename];
        if (!texture) {
          const textureHref = new URL(filename, baseHref[i]).href;
          texture = twgl.createTexture(gl, {src: textureHref, flipY: true});
          textures[filename] = texture;
        }
        material[key] = texture;
      });
  }

  const defaultMaterial = {
    diffuse: [1, 1, 1],
    diffuseMap: textures.defaultWhite,
    ambient: [0, 0, 0],
    specular: [1, 1, 1],
    shininess: 400,
    opacity: 1,
  };


  parts[i] = obj[i].geometries.map(({material, data}) => {

    if (data.color) {
      if (data.position.length === data.color.length) {
        data.color = { numComponents: 3, data: data.color };
      }
    } else {
      data.color = { value: [1, 1, 1, 1] };
    }

    // cria um buffer para cada array
    const bufferInfo = twgl.createBufferInfoFromArrays(gl, data);
    const vao = twgl.createVAOFromBufferInfo(gl, meshProgramInfo, bufferInfo);
    return {
      material: {
        ...defaultMaterial,
        ...materials[material],
      },
      bufferInfo,
      vao,
    };
  });

  function getExtents(positions) {
    const min = positions.slice(0, 3);
    const max = positions.slice(0, 3);
    for (let i = 3; i < positions.length; i += 3) {
      for (let j = 0; j < 3; ++j) {
        const v = positions[i + j];
        min[j] = Math.min(v, min[j]);
        max[j] = Math.max(v, max[j]);
      }
    }
    return {min, max};
  }

  function getGeometriesExtents(geometries) {
    return geometries.reduce(({min, max}, {data}) => {
      const minMax = getExtents(data.position);
      return {
        min: min.map((min, ndx) => Math.min(minMax.min[ndx], min)),
        max: max.map((max, ndx) => Math.max(minMax.max[ndx], max)),
      };
    }, {
      min: Array(3).fill(Number.POSITIVE_INFINITY),
      max: Array(3).fill(Number.NEGATIVE_INFINITY),
    });
  }
 
  extents = getGeometriesExtents(obj[i].geometries);
  range = m4.subtractVectors(extents.max, extents.min);
  }
  // Calcula o offset do objeto
  const objOffset = m4.scaleVector(
      m4.addVectors(
        extents.min,
        m4.scaleVector(range, 0.5)),
      -1);
  const cameraTarget = [0, 0, 0];
  // Distância do objeto da câmera
  const radius = m4.length(range) * 5;
  const cameraPosition = m4.addVectors(cameraTarget, [
    -0.5,
    0,
    radius,
  ]);

  const zNear = radius / 100;
  const zFar = radius * 3;

  function degToRad(deg) {
    return deg * Math.PI / 180;
  }

  function render(time) {
    time *= 0.001;  //converte pra segundos

    twgl.resizeCanvasToDisplaySize(gl.canvas);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.enable(gl.DEPTH_TEST);

    const fieldOfViewRadians = degToRad(60);
    const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
    const projection = m4.perspective(fieldOfViewRadians, aspect, zNear, zFar);

    const up = [0, 1, 0];
    // Calcula a matriz da câmera
    const camera = m4.lookAt(cameraPosition, cameraTarget, up);

    // Faz a inversa da matriz da câmera
    const view = m4.inverse(camera);

    const sharedUniforms = {
      u_lightDirection: m4.normalize([-1, 3, 5]),
      u_view: view,
      u_projection: projection,
      u_viewWorldPosition: cameraPosition,
    };

    gl.useProgram(meshProgramInfo.program);

    // Chama gl.uniform para cada uniforme
    twgl.setUniforms(meshProgramInfo, sharedUniforms);

    // Calcula a matriz do mundo
    let u_world = m4.yRotation(0);
    u_world = m4.translate(u_world, ...objOffset);


    for (const {bufferInfo, vao, material} of parts[0]) {
      const translatedPredio = m4.translate(u_world, 20, 1, 0)
      const tamCarro = m4.scale(translatedPredio, 1.5, 1.5, 1.5);
      gl.bindVertexArray(vao);
      twgl.setUniforms(meshProgramInfo, {
      u_world: tamCarro,

      }, material);
      twgl.drawBufferInfo(gl, bufferInfo);
    }

     // Lâmpada else if (y > 406 && y < 445)
     for (const {bufferInfo, vao, material} of parts[1]) {
      const translatedPredio = m4.translate(u_world, 20, -1.5, 0)
      const tamCarro = m4.scale(translatedPredio, 1.5, 1.5, 1.5);
      gl.bindVertexArray(vao);
      twgl.setUniforms(meshProgramInfo, {
      u_world: tamCarro,

      }, material);
      twgl.drawBufferInfo(gl, bufferInfo);
    }

    // Predio B
    for (const {bufferInfo, vao, material} of parts[2]) {
      // Move o predio para a posição correta
      const translatedPredio = m4.translate(u_world, 15, 3.5, 0)
      // Seta os atributos para essa parte.
      gl.bindVertexArray(vao);
      // Chama gl.uniform
      twgl.setUniforms(meshProgramInfo, {
      u_world: translatedPredio,
       
      }, material);
      // Desenha o objeto
      twgl.drawBufferInfo(gl, bufferInfo);
    }

    // Predio D
    for (const {bufferInfo, vao, material} of parts[3]) {
        // Move o predio para a posição correta
        const translatedPredio = m4.translate(u_world, 15, 6, 0)
        
        gl.bindVertexArray(vao);
        twgl.setUniforms(meshProgramInfo, {
        u_world: translatedPredio,
        }, material);
        twgl.drawBufferInfo(gl, bufferInfo);
    }
      
    // Rua reta
    for (const {bufferInfo, vao, material} of parts[4]) {
      // Move a rua para a posição correta
      const translatedPredio = m4.translate(u_world, -3, -5, 20)
      // Rotaciona a rua
      const rotatedRuaZ = m4.zRotation(0.5 * Math.PI);
      m4.multiply(rotatedRuaZ, translatedPredio, rotatedRuaZ);
      const rotatedRuaY = m4.yRotation(0.5 * Math.PI);
      m4.multiply(rotatedRuaY, rotatedRuaZ, rotatedRuaY);
      
      gl.bindVertexArray(vao);
      twgl.setUniforms(meshProgramInfo, {
      u_world: rotatedRuaY,
       
      }, material);
      twgl.drawBufferInfo(gl, bufferInfo);
    }

    // Carro de polícia
    for (const {bufferInfo, vao, material} of parts[5]) {
      // Move o carro para a posição correta
      const translatedPredio = m4.translate(u_world, 15, 0.8, 0)
      // Aumenta o tamanho do carro
      const tamCarro = m4.scale(translatedPredio, 1.5, 1.5, 1.5);
      gl.bindVertexArray(vao);
      twgl.setUniforms(meshProgramInfo, {
      u_world: tamCarro,

      }, material);
      twgl.drawBufferInfo(gl, bufferInfo);
    }

    // Carro vermelho
    for (const {bufferInfo, vao, material} of parts[6]) {
      const translatedPredio = m4.translate(u_world, 15, 2, 0)
      const tamCarro = m4.scale(translatedPredio, 1.5, 1.5, 1.5);
      gl.bindVertexArray(vao);
      twgl.setUniforms(meshProgramInfo, {
      u_world: tamCarro,

      }, material);
      twgl.drawBufferInfo(gl, bufferInfo);
    }

    // Esquina
    for (const {bufferInfo, vao, material} of parts[7]) {
      const translatedPredio = m4.translate(u_world, -6, -5, 20)
      const rotatedRuaZ = m4.zRotation(0.5 * Math.PI);
      m4.multiply(rotatedRuaZ, translatedPredio, rotatedRuaZ);
      const rotatedRuaY = m4.yRotation(0.5 * Math.PI);
      m4.multiply(rotatedRuaY, rotatedRuaZ, rotatedRuaY);
      gl.bindVertexArray(vao);
      twgl.setUniforms(meshProgramInfo, {
      u_world: rotatedRuaY,
       
      }, material);
      twgl.drawBufferInfo(gl, bufferInfo);
    }

    // Faixa de segurança
    for (const {bufferInfo, vao, material} of parts[8]) {
      const translatedPredio = m4.translate(u_world, -9, -5, 20)
      const rotatedRuaZ = m4.zRotation(0.5 * Math.PI);
      m4.multiply(rotatedRuaZ, translatedPredio, rotatedRuaZ);
      const rotatedRuaY = m4.yRotation(0.5 * Math.PI);
      m4.multiply(rotatedRuaY, rotatedRuaZ, rotatedRuaY);
      // set the attributes for this part.
      gl.bindVertexArray(vao);
      // calls gl.uniform
      twgl.setUniforms(meshProgramInfo, {
      u_world: rotatedRuaY,
       
      }, material);
      // calls gl.drawArrays or gl.drawElements
      twgl.drawBufferInfo(gl, bufferInfo);
    }

    // Bifurcacao
    for (const {bufferInfo, vao, material} of parts[9]) {
      const translatedPredio = m4.translate(u_world, -12, -5, 20)
      const rotatedRuaZ = m4.zRotation(0.5 * Math.PI);
      m4.multiply(rotatedRuaZ, translatedPredio, rotatedRuaZ);
      const rotatedRuaY = m4.yRotation(0.5 * Math.PI);
      m4.multiply(rotatedRuaY, rotatedRuaZ, rotatedRuaY);
      // set the attributes for this part.
      gl.bindVertexArray(vao);
      // calls gl.uniform
      twgl.setUniforms(meshProgramInfo, {
      u_world: rotatedRuaY,
       
      }, material);
      // calls gl.drawArrays or gl.drawElements
      twgl.drawBufferInfo(gl, bufferInfo);
    }

     // Predio F
     for (const {bufferInfo, vao, material} of parts[10]) {
      const translatedPredio = m4.translate(u_world, 19, 3.5, 0)
      // set the attributes for this part.
      gl.bindVertexArray(vao);
      // calls gl.uniform
      twgl.setUniforms(meshProgramInfo, {
      u_world: translatedPredio,
       
      }, material);
      // calls gl.drawArrays or gl.drawElements
      twgl.drawBufferInfo(gl, bufferInfo);
    }
    
    // Predio H
    for (const {bufferInfo, vao, material} of parts[11]) {
      const translatedPredio = m4.translate(u_world, 19, 6.5, 0)
      // set the attributes for this part.
      gl.bindVertexArray(vao);
      // calls gl.uniform
      twgl.setUniforms(meshProgramInfo, {
      u_world: translatedPredio,
       
      }, material);
      // calls gl.drawArrays or gl.drawElements
      twgl.drawBufferInfo(gl, bufferInfo);
    }

    
   

    
    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
}

main();
