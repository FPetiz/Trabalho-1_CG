"use strict";

// This is not a full .obj parser.
// see http://paulbourke.net/dataformats/obj/


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

  let objHref = [
    "obj\\building_B.obj", 
    "obj\\building_D.obj", 
    "obj\\road_straight.obj", 
    "obj\\car_police.obj", 
    "obj\\road_corner.obj", 
    "obj\\road_straight_crossing.obj",
    "obj\\car_hatchback.obj", 
    "obj\\road_tsplit.obj",
    "obj\\building_F.obj",
    "obj\\building_H.obj",
    "obj\\trafficlight_C.obj",
    "obj\\streetlight.obj",

  ];
  let response = [];
  let text = [];
  let obj = [];
  let baseHref = [];
  let matTexts = [];
  let matHref = [];
  let range = 0;
  let parts = [];
  let extents = [];
  let objOffset = [];
 
  // Adiciona cada objeto num array parts
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

  // carrega materiais e texturas
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

  // calcula os limites de cada objeto
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
 
  extents[i] = getGeometriesExtents(obj[i].geometries);
  range = m4.subtractVectors(extents[i].max, extents[i].min);

  // Quanto o objeto deve ser deslocado para que o centro dele seja a origem
  objOffset[i] = m4.scaleVector(
    m4.addVectors(
      extents[i].min,
      m4.scaleVector(range, 0.5)),
    -1);
  }
  
  // Mira da camera e posição da camera
  const cameraTarget = [0, 0, 0];
  const radius = m4.length(range) * 14;
  const cameraPosition = m4.addVectors(cameraTarget, [
    -2,
    6,
    radius,
  ]);

  // Distância do plano de projeção
  const zNear = radius / 100;
  const zFar = radius * 100;

  function degToRad(deg) {
    return deg * Math.PI / 240;
  }

  // Cria um array de objetos
  let objetos = [];

  // Adiciona um objeto ao array de objetos
  function addObject(nome, index){
    objetos.push({ nome: nome,
    parts: parts[index],
    visivel: true,
    selected: true,
    position: [0,0,0],
    extents: extents[index],
    objOffset: objOffset[index],
    rotation: [0,0,0],
    scale: 1
    });
  }

  // Numero de cada coisa que existe
  let numprediob = 0;
  let numprediod = 0;
  let numruareta = 0;
  let numcarropolicia = 0;
  let numesquina = 0;
  let numfaixaseguranca = 0;
  let numcarrovermelho = 0;
  let numbifurcacao = 0;
  let numprediof = 0;
  let numpredioh = 0;
  let numtrafficlight = 0;
  let numstreetlight = 0;

  // Cria um dropdown com os objetos
  var select = document.getElementById("item-list");

  // Adiciona os objetos ao dropdown assim que forem clicados na posição que eles existem no menu 3D
  canvas.addEventListener("click", (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
   
    console.log("Clique detectado em:", x, y);
  
    let newObjectIndex = -1;
    
    if (x > 1036 && x < 1123) {
      if (y > 260  && y < 298) {
        addObject("predioB", 0);
        newObjectIndex = objetos.length - 1;
        select.add(new Option("predioB_" + numprediob, newObjectIndex));
        numprediob++;
      } else if (y > 157 && y < 221 ) {
        addObject("predioD", 1);
        newObjectIndex = objetos.length - 1;
        select.add(new Option("predioD_" + numprediod, newObjectIndex));
        numprediod++;
      } else if (y > 408 && y < 445) {
        addObject("ruaReta", 2);
        newObjectIndex = objetos.length - 1;
        select.add(new Option("ruaReta_" + numruareta, newObjectIndex));
        numruareta++;
      } else if (y > 365 && y < 378) {
        addObject("carroPolicia", 3);
        newObjectIndex = objetos.length - 1;
        select.add(new Option("carroPolicia_" + numcarropolicia, newObjectIndex));
        numcarropolicia++;
      } else if (y > 474 && y < 511) {
        addObject("esquina", 4);
        newObjectIndex = objetos.length - 1;
        select.add(new Option("esquina_" + numesquina, newObjectIndex));
        numesquina++;
      } else if (y > 543 && y < 579) {
        addObject("FaixaSeguranca", 5);
        newObjectIndex = objetos.length - 1;
        select.add(new Option("FaixaSeguranca_" + numfaixaseguranca, newObjectIndex));
        numfaixaseguranca++;
      }  else if (y > 335 && y < 344) {
        addObject("CarroVermelho", 6);
        newObjectIndex = objetos.length - 1;
        select.add(new Option("CarroVermelho_" + numcarrovermelho, newObjectIndex));
        numcarrovermelho++;
      } else if (y > 606 && y < 648) {
        addObject("Bifurcacao", 7);
        newObjectIndex = objetos.length - 1;
        select.add(new Option("Bifurcacao_" + numbifurcacao, newObjectIndex));
        numbifurcacao++; 
      }   
      // Se um objeto foi adicionado, selecione ele
      if (newObjectIndex !== -1) {
        select.value = newObjectIndex;
        selectObject(newObjectIndex);
      }
    }
    if ( x > 1145 && x < 1241) {
      if (y > 237 && y < 298) {
        addObject("PredioH", 8);
        newObjectIndex = objetos.length - 1;
        select.add(new Option("PredioH_" + numpredioh, newObjectIndex));
        numpredioh++;
      } else if (y > 132 && y < 203) {
        addObject("PredioF", 9);
        newObjectIndex = objetos.length - 1;
        select.add(new Option("PredioF_" + numprediof, newObjectIndex));
        numprediof++;
      } else if (y > 333 && y < 374) {
        addObject("Sinaleira", 10);
        newObjectIndex = objetos.length - 1;
        select.add(new Option("Silaneira_" + numtrafficlight, newObjectIndex));
        numtrafficlight++;
      } else if (y > 408 && y < 447) {
        addObject("PosteDeLuz", 11);
        newObjectIndex = objetos.length - 1;
        select.add(new Option("PosteDeLuz_" + numstreetlight, newObjectIndex));
        numstreetlight++;
      }

      if (newObjectIndex !== -1) {
        select.value = newObjectIndex;
        selectObject(newObjectIndex);
      }
    }
});

  // Atualiza os sliders com a posição do objeto selecionado
  function updateSlider(x, y, z, rx, ry, rz, sc) {
    const xSlider = document.getElementById('xSlider');
    const ySlider = document.getElementById('ySlider');
    const zSlider = document.getElementById('zSlider');

    const xRotSlider = document.getElementById("xRotationSlider");
    const yRotSlider = document.getElementById("yRotationSlider");
    const zRotSlider = document.getElementById("zRotationSlider");
    const scaleSlider = document.getElementById("scaleSlider");
    
    if (xSlider) xSlider.value = x;
    if (ySlider) ySlider.value = y;
    if (zSlider) zSlider.value = z;

    if (xRotSlider) xRotSlider.value = rx;
    if (yRotSlider) yRotSlider.value = ry;
    if (zRotSlider) zRotSlider.value = rz;
    if (scaleSlider) scaleSlider.value = sc;

  }

  // Função que lida com as mudanças nos sliders
  function handleSliderChange() {
    const currentX = parseFloat(document.getElementById('xSlider').value);
    const currentY = parseFloat(document.getElementById('ySlider').value);
    const currentZ = parseFloat(document.getElementById('zSlider').value);

    const currentRotX = parseFloat(document.getElementById('xRotationSlider').value);
    const currentRotY = parseFloat(document.getElementById('yRotationSlider').value);
    const currentRotZ = parseFloat(document.getElementById('zRotationSlider').value);
    const currentScale = parseFloat(document.getElementById('scaleSlider').value);
    
    // Só atualiza a posição do objeto selecionado
    for (let i = 0; i < objetos.length; i++) {
        if (objetos[i].selected) {
            objetos[i].position[0] = currentX;
            objetos[i].position[1] = currentY;
            objetos[i].position[2] = currentZ;

            objetos[i].rotation[0] = currentRotX;
            objetos[i].rotation[1] = currentRotY;
            objetos[i].rotation[2] = currentRotZ;
            objetos[i].scale = currentScale;
            break; // sai do loop depois de atualizar o objeto selecionado
        }
    }
  }

  // Adiciona um evento para quando um objeto é selecionado no dropdown
  const dropdown = document.getElementById('item-list');
  dropdown.addEventListener('change', () => {
    const selectedIndex = parseInt(dropdown.value);
    selectObject(selectedIndex);
  });

  // deseleciona todos os objetos
  function deselectAllObjects() {
    for (const objeto of objetos) {
      objeto.selected = false;
    }
  }

// Seleciona um objeto
  function selectObject(index) {
    deselectAllObjects();
    if (index >= 0 && index < objetos.length) {
      objetos[index].selected = true;
      // Atualiza os sliders com a posição do objeto selecionado
      updateSlider(
        objetos[index].position[0],
        objetos[index].position[1],
        objetos[index].position[2],
        objetos[index].rotation[0],
        objetos[index].rotation[1],
        objetos[index].rotation[2],
        objetos[index].scale
      );
    }
  }

  window.removeSelectedObject = function() {
    const select = document.getElementById('item-list');
    const selectedIndex = parseInt(select.value);
    
    // Check if there's a selected object
    if (selectedIndex >= 0 && selectedIndex < objetos.length) {
        // Ask for confirmation
        if (confirm('Are you sure you want to remove this object?')) {
            // Remove the object from the objetos array
            objetos.splice(selectedIndex, 1);
            
            // Remove the option from the dropdown
            select.remove(select.selectedIndex);
            
            // Update the values of remaining options
            for (let i = 0; i < select.options.length; i++) {
                select.options[i].value = i;
            }
            
            // If there are still objects, select the first one
            if (objetos.length > 0) {
                select.value = 0;
                selectObject(0);
            } else {
                // If no objects remain, reset the sliders
                updateSlider(0, 0, 0, 0, 0, 0, 1);
            }
        }
    } else {
        alert('Please select an object to remove');
    }
}

  // Atribui um evento para cada slider
  document.getElementById('xSlider').addEventListener('input', handleSliderChange);
  document.getElementById('ySlider').addEventListener('input', handleSliderChange);
  document.getElementById('zSlider').addEventListener('input', handleSliderChange);

  document.getElementById('xRotationSlider').addEventListener('input', handleSliderChange);
  document.getElementById('yRotationSlider').addEventListener('input', handleSliderChange);
  document.getElementById('zRotationSlider').addEventListener('input', handleSliderChange);
  document.getElementById('scaleSlider').addEventListener('input', handleSliderChange);


  // Função para salvar o estado dos objetos
  window.saveObjectsState = function() {
    // Cria um array de objetos com as propriedades que queremos salvar
    const objectsState = objetos.map(obj => ({
        nome: obj.nome,
        position: [...obj.position],
        visivel: obj.visivel,
        selected: obj.selected,
        objOffset: [...obj.objOffset],
        rotation: [...obj.rotation],
        scale: obj.scale
    }));

    // Converte o array de objetos para JSON
    const stateJSON = JSON.stringify(objectsState, null, 2);

    // Cria um blob com o JSON e um link para download
    const blob = new Blob([stateJSON], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'scene_state.json';
    
    // Baixa
    document.body.appendChild(link);
    link.click();
    
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // Função para carregar o estado dos objetos
  function loadObjectsState(file) {
    const reader = new FileReader();
    
    reader.onload = function(e) {
        try {
            const loadedState = JSON.parse(e.target.result);
            
            // Limpa a cena
            objetos = [];
            select.innerHTML = '';
            
            // Reseta os contadores
            numprediob = 0;
            numprediod = 0;
            numruareta = 0;
            numcarropolicia = 0;
            numesquina = 0;
            numfaixaseguranca = 0;
            numcarrovermelho = 0;
            numbifurcacao = 0;
            numprediof = 0;
            numpredioh = 0;
            numtrafficlight = 0;
            numstreetlight = 0;
            
            // Recria os objetos
            loadedState.forEach((state) => {
                let objectTypeIndex;
                let objectName;
                let counter;
                
                // Determina o tipo de objeto e o nome
                switch(state.nome) {
                    case "predioB":
                        objectTypeIndex = 0;
                        objectName = "predioB_" + numprediob;
                        counter = numprediob++;
                        break;
                    case "predioD":
                        objectTypeIndex = 1;
                        objectName = "predioD_" + numprediod;
                        counter = numprediod++;
                        break;
                    case "ruaReta":
                        objectTypeIndex = 2;
                        objectName = "ruaReta_" + numruareta;
                        counter = numruareta++;
                        break;
                    case "carroPolicia":
                        objectTypeIndex = 3;
                        objectName = "carroPolicia_" + numcarropolicia;
                        counter = numcarropolicia++;
                        break;
                    case "esquina":
                        objectTypeIndex = 4;
                        objectName = "esquina_" + numesquina;
                        counter = numesquina++;
                        break;
                    case "FaixaSeguranca":
                        objectTypeIndex = 5;
                        objectName = "FaixaSeguranca_" + numfaixaseguranca;
                        counter = numfaixaseguranca++;
                        break;
                    case "CarroVermelho":
                        objectTypeIndex = 6;
                        objectName = "CarroVermelho_" + numcarrovermelho;
                        counter = numcarrovermelho++;
                        break;
                    case "Bifurcacao":
                        objectTypeIndex = 7;
                        objectName = "Bifurcacao_" + numbifurcacao;
                        counter = numbifurcacao++;
                        break;
                    case "PredioF":
                        objectTypeIndex = 9;
                        objectName = "PredioF_" + numprediof;
                        counter = numprediof++;
                        break;
                    case "PredioH":
                        objectTypeIndex = 8;
                        objectName = "PredioH_" + numpredioh;
                        counter = numpredioh++;
                        break;
                    case "Sinaleira":
                        objectTypeIndex = 10;
                        objectName = "Sinaleira_" + numtrafficlight;
                        counter = numtrafficlight++;
                        break;
                    case "PosteDeLuz":
                        objectTypeIndex = 11;
                        objectName = "PosteDeLuz_" + numstreetlight;
                        counter = numstreetlight++;
                        break;
                }
                
                // Adiciona o objeto a cena
                addObject(state.nome, objectTypeIndex);
                
                // Vê o ultimo objeto adicionado
                const newObject = objetos[objetos.length - 1];
                
                // Aplica o estado carregado ao objeto
                newObject.position = [...state.position];
                newObject.visivel = state.visivel;
                newObject.selected = state.selected;
                newObject.objOffset = [...state.objOffset];
                newObject.rotation = [...state.rotation];
                newObject.scale = state.scale;
                
                // Adiciona o objeto ao dropdown
                select.add(new Option(objectName, objetos.length - 1));
            });
            
            // Encontra o objeto selecionado e atualiza os sliders
            const selectedObj = objetos.find(obj => obj.selected);
            if (selectedObj) {
                const selectedIndex = objetos.indexOf(selectedObj);
                select.value = selectedIndex;
                updateSlider(
                    selectedObj.position[0],
                    selectedObj.position[1],
                    selectedObj.position[2],
                    selectedObj.rotation[0],
                    selectedObj.rotation[1],
                    selectedObj.rotation[2],
                    selectedObj.scale
                );
            }
            
        } catch (error) {
            console.error('Error loading state:', error);
        }
    };
    
    reader.readAsText(file);
}
  // Adiciona um evento para o botão de carregar estado
  document.getElementById('stateLoader').addEventListener('change', (event) => {
    if (event.target.files.length > 0) {
        loadObjectsState(event.target.files[0]);
    }
  });

  function render(time) {
    time *= 0.001;  // Converte para segundos
    

    twgl.resizeCanvasToDisplaySize(gl.canvas);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.enable(gl.DEPTH_TEST);

    const fieldOfViewRadians = degToRad(60);
    const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
    const projection = m4.perspective(fieldOfViewRadians, aspect, zNear, zFar);

    const up = [0, 1, 0];
    // Computa a matriz da câmera
    const camera = m4.lookAt(cameraPosition, cameraTarget, up);

    // Faz a inversa da matriz da câmera para obter a view matrix
    const view = m4.inverse(camera);

    const sharedUniforms = {
      u_lightDirection: m4.normalize([-1, 3, 5]),
      u_view: view,
      u_projection: projection,
      u_viewWorldPosition: cameraPosition,
    };

    gl.useProgram(meshProgramInfo.program);

    // Chama a função para desenhar os objetos
    twgl.setUniforms(meshProgramInfo, sharedUniforms);

    for (const objeto of objetos) {
      for (const {bufferInfo, vao, material} of objeto.parts) {
        let matrix = m4.identity();  // Começa com a matriz identidade

        if (objeto.visivel) {
          if (objeto.selected) {
            updateSlider(
              objeto.position[0],
              objeto.position[1],
              objeto.position[2],
              objeto.rotation[0],
              objeto.rotation[1],
              objeto.rotation[2],
              objeto.scale
            );
            
            // Pega os valores dos sliders
            objeto.position[0] = parseFloat(document.getElementById('xSlider').value);
            objeto.position[1] = parseFloat(document.getElementById('ySlider').value);
            objeto.position[2] = parseFloat(document.getElementById('zSlider').value);

            // Atualiza a rotação do objeto
            objeto.rotation[0] = parseFloat(document.getElementById('xRotationSlider').value);
            objeto.rotation[1] = parseFloat(document.getElementById('yRotationSlider').value);
            objeto.rotation[2] = parseFloat(document.getElementById('zRotationSlider').value);
          }

          // Faz o offset do objeto
          matrix = m4.translate(matrix, ...objeto.objOffset);
          
          // Aplica a posição, rotação e escala do objeto
          matrix = m4.translate(matrix,
            objeto.position[0]*0.1,
            objeto.position[1]*0.1,
            objeto.position[2]*0.1
          );
          
          // Combina as rotações
          matrix = m4.multiply(matrix, m4.xRotation(Math.PI * objeto.rotation[0])); 
          matrix = m4.multiply(matrix, m4.yRotation(Math.PI * objeto.rotation[1])); 
          matrix = m4.multiply(matrix, m4.zRotation(Math.PI * objeto.rotation[2]));             
          
          if (objeto.scale !== 1) {
            matrix = m4.scale(matrix, objeto.scale, objeto.scale, objeto.scale);

          }

          gl.bindVertexArray(vao);
          twgl.setUniforms(meshProgramInfo, {
            u_world: matrix,
          }, material);

          // Desenha o objeto
          twgl.drawBufferInfo(gl, bufferInfo);
        }
      }
    }

    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
}



main();
