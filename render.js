(function(exports) {
    "use strict";

    var GLRender = {};

    var VERTEX_ATTRIBS = [
        { storage: "vec3", attrib: FLVER.StreamDescAttrib.Position, name: "position", },
        { storage: "vec3", attrib: FLVER.StreamDescAttrib.Normal,   name: "normal", },
        { storage: "vec2", attrib: FLVER.StreamDescAttrib.UV,       name: "uv", },
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
        main.push("gl_Position = u_projection * u_view * u_localMatrix * vec4(a_position, 1.0);");

        main.push("v_position = a_position;");
        main.push("v_normal = a_normal;");

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

        function makeAttribute(attrib) {
            varyings.push("varying " + attrib.storage + " v_" + attrib.name + ";");
        }
        VERTEX_ATTRIBS.forEach(makeAttribute);

        main.push("gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);");

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

    function generateMaterialProgram(gl, material) {
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

        return prog;
    }

    GLRender.translateFLVER = function(gl, flver) {
        function translateMaterial(material) {
            var prog = generateMaterialProgram(gl, material);

            function getLocationForAttrib(attrib) {
                return prog.attribLocations[attrib];
            }

            return function(state) {
                gl.useProgram(program);
                state.currentProgram = program;
                state.getLocationForAttrib = getLocationForAttrib;
                state.bindUniforms();
            };
        }

        function translateStreamDesc(streamDesc, totalSize) {
            return function(state) {
                var location = state.getLocationForAttrib(streamDesc.attrib);
                gl.vertexAttribPointer(
                    location,         // location
                    streamDesc.size,  // size
                    gl.FLOAT,         // type
                    false,            // normalize
                    totalSize,        // stride
                    streamDesc.offset // offset
                );
                gl.enableVertexAttribPointer(location);
            };
        }

        function translateVtxDesc(vtxDesc) {
            var streamDescs = flver.streamDescs.slice(vtxDesc.streamDescStart, vtxDesc.streamDescEnd);
            var totalSize = 0;
            streamDescs.forEach(function(streamDesc) {
                totalSize += streamDesc.size;
            });
            var cmd_attribs = streamDescs.map(function(streamDesc) {
                return translateStreamDesc(streamDesc, totalSize);
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
            var primitives = flver.facesets.slice(batch.facesetStart, batch.facesetEnd);
            var cmd_primitives = facesets.map(translatePrimitive);
            return function(state) {
                // Set up our material data.
                cmd_material(state);
                // Bind the vertex data.
                cmd_vtxInfo(state);
                // Run through each faceset and execute the draw.
                cmd_primitives.forEach(function(f) { return f(state); });
            };
        }

        var cmd_batches = flver.meshes.map(translateBatch);
        function draw() {
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
        mat4.perspective(this._projection, Math.PI / 4, gl.viewportWidth / gl.viewportHeight, 0.1*128, 2500*128);

        this._view = mat4.create();

        gl.depthMask(true);
        gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);
        gl.clearColor(200/255, 50/255, 153/255, 1);

        this.models = [];
        this._t = 0;
    }
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

    function Driver(canvas) {
        this._canvas = canvas;
        var gl = this._gl = this._canvas.getContext("webgl", { alpha: false });
        gl.viewportWidth = canvas.width;
        gl.viewportHeight = canvas.height;

        this._scene = new Scene(gl);
        var camera = this._camera = mat4.create();
        mat4.translate(camera, camera, [-149, -2510, -4353]);
        this._scene.setCamera(camera);

        this._setupMainloop();
    }
    Driver.prototype._setupMainloop = function() {
        var keysDown = {};
        var dragging = false, lx = 0, ly = 0;
        var SHIFT = 16;
        var camera = this._camera;

        function isKeyDown(key) {
            return !!keysDown[key.charCodeAt(0)];
        }

        window.addEventListener('keydown', function(e) {
            keysDown[e.keyCode] = true;
        });
        window.addEventListener('keyup', function(e) {
            delete keysDown[e.keyCode];
        });

        canvas.addEventListener('mousedown', function(e) {
            dragging = true;
            lx = e.pageX; ly = e.pageY;
        });
        canvas.addEventListener('mouseup', function(e) {
            dragging = false;
        });
        canvas.addEventListener('mousemove', function(e) {
            if (!dragging)
                return;

            var dx = e.pageX - lx;
            var dy = e.pageY - ly;
            var cu = [camera[1], camera[5], camera[9]];
            vec3.normalize(cu, cu);
            mat4.rotate(camera, camera, -dx / 500, cu);
            mat4.rotate(camera, camera, -dy / 500, [1, 0, 0]);
            lx = e.pageX; ly = e.pageY;
        });

        var tmp = mat4.create();
        var t = 0;
        var update = function(nt) {
            var dt = nt - t;
            t = nt;

            var mult = 20;
            if (keysDown[SHIFT])
                mult *= 10;
            mult *= (dt / 16.0);

            var amt;
            amt = 0;
            if (isKeyDown('W'))
                amt = -mult;
            else if (isKeyDown('S'))
                amt = mult;
            tmp[14] = amt;

            amt = 0;
            if (isKeyDown('A'))
                amt = -mult;
            else if (isKeyDown('D'))
                amt = mult;
            tmp[12] = amt;

            if (isKeyDown('B'))
                mat4.identity(camera);
            if (isKeyDown('C'))
                console.log(camera);

            mat4.multiply(camera, camera, tmp);

            this._scene.setCamera(camera);
            window.requestAnimationFrame(update);
        }.bind(this);

        update(0);
    };
    GLRender.Driver = Driver;

    exports.GLRender = GLRender;

})(window);
