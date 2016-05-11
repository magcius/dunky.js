(function(exports) {
    "use strict";

    var GLRender = {};

    var VERTEX_ATTRIBS = [
        { storage: "vec3", attrib: FLVER.formatAttrib.Position, name: "position", },
        { storage: "vec3", attrib: FLVER.formatAttrib.Normal,   name: "normal", },
        { storage: "vec2", attrib: FLVER.formatAttrib.UV,       name: "uv", },
        { storage: "vec4", attrib: FLVER.formatAttrib.Color,    name: "color", },
    ];

    function generateShader(decls, main) {
        var indentedMain = main.map(function(x) {
            return "    " + x;
        });

        return (decls.join("\n") + "\n\n" +
            "void main() {\n" +
            indentedMain.join("\n") + "\n" +
            "}\n");
    }

    function generateVertShader(material) {
        var uniforms = [];
        var varyings = [];
        var attributes = [];
        var main = [];

        uniforms.push("uniform mat4 u_projection;");
        uniforms.push("uniform mat4 u_view;");
        uniforms.push("uniform mat4 u_localMatrix;");

        function makeAttribute(attrib) {
            varyings.push("varying " + attrib.storage + " v_" + attrib.name + ";");
            attributes.push("attribute " + attrib.storage + " a_" + attrib.name + ";");
        }
        VERTEX_ATTRIBS.forEach(makeAttribute);

        // We should always have position.
        main.push("mat4 flipMatrix = mat4(-1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0);");
        main.push("gl_Position = u_projection * u_view * flipMatrix * u_localMatrix * vec4(a_position, 1.0);");

        main.push("v_position = a_position;");
        main.push("v_normal = a_normal;");
        main.push("v_uv = a_uv / 1024.0;");
        main.push("v_color = a_color;");

        var decls = [];
        decls.push.apply(decls, uniforms);
        decls.push("");
        decls.push.apply(decls, varyings);
        decls.push("");
        decls.push.apply(decls, attributes);
        return generateShader(decls, main);
    }

    function generateFragShader(bmd, material) {
        var mat3 = bmd.mat3;
        var header = [];
        var varyings = [];
        var uniforms = [];
        var init = [];
        var main = [];

        header.push("precision mediump float;");
        uniforms.push("uniform sampler2D g_Diffuse;");

        function makeAttribute(attrib) {
            varyings.push("varying " + attrib.storage + " v_" + attrib.name + ";");
        }
        VERTEX_ATTRIBS.forEach(makeAttribute);

        main.push("gl_FragColor = texture2D(g_Diffuse, v_uv);");

        // Simple alpha testing -- I have no idea if this is what the game does.
        main.push("if (gl_FragColor.r < 0.01 && gl_FragColor.g < 0.01 && gl_FragColor.b < 0.01)");
        main.push("    discard;");

        var decls = [];
        decls.push.apply(decls, header);
        decls.push("");
        decls.push.apply(decls, uniforms);
        decls.push("");
        decls.push.apply(decls, varyings);

        var src = [];
        src.push.apply(src, init);
        src.push("");
        src.push.apply(src, main);
        return generateShader(decls, src);
    }

    function compileShader(gl, str, type) {
        var shader = gl.createShader(type);

        gl.shaderSource(shader, str);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error(str, gl.getShaderInfoLog(shader));
            return null;
        }

        return shader;
    }

    var MAT = null;
    function generateMaterialProgram(gl, material) {
        if (MAT)
            return MAT;

        var vert = generateVertShader(material);
        var vertShader = compileShader(gl, vert, gl.VERTEX_SHADER);

        var frag = generateFragShader(material);
        var fragShader = compileShader(gl, frag, gl.FRAGMENT_SHADER);

        var prog = gl.createProgram();
        gl.attachShader(prog, vertShader);
        gl.attachShader(prog, fragShader);
        gl.linkProgram(prog);

        prog.uniformLocations = {};
        ["projection", "view", "localMatrix"].forEach(function(name) {
            prog.uniformLocations[name] = gl.getUniformLocation(prog, "u_" + name);
        });

        prog.attribLocations = [];
        VERTEX_ATTRIBS.forEach(function(attrib) {
            prog.attribLocations[attrib.attrib] = gl.getAttribLocation(prog, "a_" + attrib.name);
        });

        MAT = prog;
        return prog;
    }

    GLRender.translateFLVER = function(gl, flver, res) {
        function translateMaterial(material) {
            var prog = generateMaterialProgram(gl, material);

            function getLocationForAttrib(attrib) {
                return prog.attribLocations[attrib];
            }

            var params = {};
            for (var i = material.mtdParamStart; i < material.mtdParamEnd; i++) {
                var mtdParam = flver.mtdParams[i];
                params[mtdParam.name] = mtdParam.value;
            }

            function getTextureFormat(format) {
                var ext = gl.getExtension('WEBGL_compressed_texture_s3tc');
                if (format === 'DXT1')
                    return ext.COMPRESSED_RGBA_S3TC_DXT1_EXT;
                if (format === 'DXT5')
                    return ext.COMPRESSED_RGBA_S3TC_DXT5_EXT;
            }

            function loadTexture(name) {
                var texId = gl.createTexture();

                function loadLevel(level) {
                    var view = new Uint8Array(level.buffer);
                    gl.compressedTexImage2D(gl.TEXTURE_2D, level.idx, getTextureFormat(level.format), level.width, level.height, 0, view);
                }

                res.loadTexture(name).then(function(dds) {
                    gl.bindTexture(gl.TEXTURE_2D, texId);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                    dds.levels.forEach(loadLevel);
                }, function() {
                    console.warn("Could not find texture", name);
                });

                return texId;
            }

            var diffuseTexId;
            if (params['g_Diffuse'] !== undefined)
                diffuseTexId = loadTexture(params['g_Diffuse']);
            else
                diffuseTexId = null;

            return function(state) {
                gl.useProgram(prog);
                state.currentProgram = prog;
                state.getLocationForAttrib = getLocationForAttrib;
                state.bindUniforms(prog);
                gl.uniformMatrix4fv(prog.uniformLocations["localMatrix"], false, model.localMatrix);
                if (diffuseTexId)
                    gl.bindTexture(gl.TEXTURE_2D, diffuseTexId);
            };
        }

        function translateformat1(format) {
            function getComponentType(dataType) {
                switch (dataType) {
                case 21:
                case 22:
                    // Seen with UV.
                    return gl.SHORT;
                case 17:
                case 19:
                    // Seen with vertex colors.
                    return gl.UNSIGNED_BYTE;
                default:
                    return gl.FLOAT;
                }
            }

            function getComponentCount(dataType) {
                // TODO: Figure out what these data types are.
                switch (dataType) {
                case 17:
                case 19:
                    // Colors and normals -- 4 bytes.
                    return 4;
                case 21:
                    // One set of UVs -- two shorts.
                    return 2;
                case 22:
                    // Two sets of UVs -- four shorts.
                    return 4;
                case 2:
                case 18:
                case 20:
                case 23:
                case 24:
                case 25:
                    // Everything else -- three floats.
                    return 3;
                }

                XXX;
            }

            // XXX: Yuck, modifying the format :(
            format.componentCount = getComponentCount(format.dataType);
            format.componentType = getComponentType(format.dataType);

            function getTypeSize(type) {
                switch (type) {
                case gl.BYTE:
                case gl.UNSIGNED_BYTE:
                    return 1;
                case gl.SHORT:
                case gl.UNSIGNED_SHORT:
                    return 2;
                case gl.FLOAT:
                    return 4;
                }
            }

            format.size = getTypeSize(format.componentType) * format.componentCount;
        }

        function translateformat2(format, totalSize) {
            return function(state) {
                var location = state.getLocationForAttrib(format.attrib);

                // We haven't implemented this one yet...
                if (location === undefined)
                    return;

                var componentCount = format.componentCount;
                var componentType = format.componentType;

                gl.vertexAttribPointer(
                    location,         // location
                    componentCount,   // count
                    componentType,    // type
                    false,            // normalize
                    totalSize,        // stride
                    format.offset // offset
                );
                gl.enableVertexAttribArray(location);
            };
        }

        function translateVtxDesc(vtxDesc) {
            var formats = flver.formats.slice(vtxDesc.formatStart, vtxDesc.formatEnd);
            var totalSize = 0;
            formats.forEach(function(format) {
                translateformat1(format);
                totalSize += format.size;
            })
            var cmd_attribs = formats.map(function(format) {
                return translateformat2(format, totalSize);
            });

            return function(state) {
                cmd_attribs.forEach(function(f) { return f(state); });
            };
        }

        function translateVtxInfo(vtxInfo) {
            var vtxDesc = flver.vtxDescs[vtxInfo.vtxDescIdx];
            var cmd_vtxDesc = translateVtxDesc(vtxDesc);

            var buffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.bufferData(gl.ARRAY_BUFFER, vtxInfo.vtxBufferData, gl.STATIC_DRAW);

            return function(state) {
                gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
                // Bind the attrib data.
                cmd_vtxDesc(state);
            };
        }

        function translatePrimitive(prim) {
            var buffer = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffer);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, prim.idxBufferData, gl.STATIC_DRAW);

            return function(state) {
                gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffer);
                gl.drawElements(gl.TRIANGLE_STRIP, prim.idxCount, gl.UNSIGNED_SHORT, 0);
            };
        }

        function translateBatch(batch) {
            var material = flver.materials[batch.materialIdx];
            var cmd_material = translateMaterial(material);
            var vtxInfo = flver.vtxInfos[batch.vtxInfoStart];
            var cmd_vtxInfo = translateVtxInfo(vtxInfo);
            var primitives = flver.primitives.slice(batch.primitiveStart, batch.primitiveEnd);
            var cmd_primitives = primitives.map(translatePrimitive);
            return function(state) {
                // Set up our material data.
                cmd_material(state);
                // Bind the vertex data.
                cmd_vtxInfo(state);
                // Run through each primitive and execute the draw.
                cmd_primitives.forEach(function(f) { return f(state); });
            };
        }

        var cmd_batches = flver.batches.map(translateBatch);
        function draw(state) {
            cmd_batches.forEach(function(f) { return f(state); });
        }

        var model = {};
        model.localMatrix = mat4.create();
        model.draw = draw;
        return model;
    }

    function Scene(gl) {
        this._gl = gl;

        this._projection = mat4.create();
        this._view = mat4.create();

        gl.clearColor(200/255, 50/255, 153/255, 1);
        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);

        this.models = [];
    }
    Scene.prototype.resized = function() {
        var gl = this._gl;
        gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);
        mat4.perspective(this._projection, Math.PI / 4, gl.viewportWidth / gl.viewportHeight, 0.1, 2500);
    };
    Scene.prototype.render = function() {
        var gl = this._gl;

        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        this.models.forEach(function(model) {
            model.draw(this);
        }.bind(this));
    };
    Scene.prototype.setCamera = function(matrix) {
        mat4.invert(this._view, matrix);
    };
    Scene.prototype.bindUniforms = function(prog) {
        var gl = this._gl;
        gl.uniformMatrix4fv(prog.uniformLocations["projection"], false, this._projection);
        gl.uniformMatrix4fv(prog.uniformLocations["view"], false, this._view);
    };

    GLRender.Scene = Scene;

    exports.GLRender = GLRender;

})(window);
