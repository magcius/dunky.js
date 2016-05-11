(function(exports) {
    "use strict";

    function LocalHttpFile(path) {
        this._path = path;
    };
    LocalHttpFile.prototype.load = function(offs, size) {
        return Promise.reject();

        return new Promise(function(resolve, reject) {
            var request = new XMLHttpRequest();
            request.open("GET", this._path, true);
            request.responseType = "blob";
            if (offs !== undefined && size !== undefined) {
                var start = offs, end = offs + size - 1;
                request.setRequestHeader("Range", "bytes=" + start + "-" + end);
            }
            request.send();
            request.onload = function() {
                resolve(request.response);
            };
            request.onerror = function() {
                reject(request);
            };
        }.bind(this));
    };

    function LocalHttpFileSystem(basePath) {
        this._basePath = basePath;
    }
    LocalHttpFileSystem.prototype.getFile = function(filename) {
        var path = this._basePath + filename;
        return new LocalHttpFile(path);
    };

    function BlobFileSystemFile(blob) {
        this._blob = blob;
    }
    BlobFileSystemFile.prototype.load = function(offs, size) {
        return new Promise(function(resolve, reject) {
            if (offs !== undefined && size !== undefined) {
                var start = offs, end = offs + size;
                resolve(this._blob.slice(start, end));
            } else {
                resolve(this._blob);
            }
        }.bind(this));
    };

    function DataDragFileSystem() {
        this._files = [];

        this._filesLeft = {
            'dvdbnd0.bhd5': 1,
            'dvdbnd0.bdt': 1,
            'dvdbnd1.bhd5': 1,
            'dvdbnd1.bdt': 1,
        };
        this._container = document.createElement('div');
        this._container.classList.add('drop-target');
        this._explanation = document.createElement('div');
        this._container.appendChild(this._explanation);
        this._updateExplanation();
        this._container.ondragover = function(e) {
            this._container.classList.add('dropping');
            e.preventDefault();
        }.bind(this);
        this._container.ondragleave = function(e) {
            this._container.classList.remove('dropping');
            e.preventDefault();
        }.bind(this);
        this._container.ondrop = function(e) {
            var transfer = e.dataTransfer;
            [].forEach.call(transfer.files, function(file) {
                this._files[file.name] = file;
                delete this._filesLeft[file.name];
            }.bind(this));
            e.preventDefault();

            this._updateExplanation();
            if (Object.keys(this._filesLeft).length === 0)
                this._loadComplete();
        }.bind(this);

        this._promise = new Promise(function(resolve, reject) {
            this._resolve = resolve;
        }.bind(this));

        document.body.appendChild(this._container);
    }
    DataDragFileSystem.prototype._updateExplanation = function() {
        var filesLeft = Object.keys(this._filesLeft);
        this._explanation.textContent = "Please drag " + filesLeft.join(', ') + " from the Dark Souls DATA folder here";
    };
    DataDragFileSystem.prototype._loadComplete = function() {
        document.body.removeChild(this._container);
        this._resolve(this);
    };
    DataDragFileSystem.prototype.load = function() {
        return this._promise;
    };
    DataDragFileSystem.prototype.getFile = function(filename) {
        return new BlobFileSystemFile(this._files[filename]);
    };

    function getFileSystem() {
        var DATA_PATH = 'http://localhost:8000/';
        var fs = new LocalHttpFileSystem(DATA_PATH);

        // Double-check that it works.
        return fs.getFile('dvdbnd0.bhd5').load(0, 2).then(function() {
            return fs;
        }, function() {
            // Nope. Fall back to data-drag.
            var dds = new DataDragFileSystem();
            return dds.load();
        });
    }

    function loadBlob(blob) {
        return new Promise(function(resolve, reject) {
            var reader = new FileReader();
            reader.onload = function() {
                resolve(reader.result);
            };
            reader.readAsArrayBuffer(blob);
        });
    }
    window.loadBlob = loadBlob;

    function loadBlobAsText(blob) {
        return new Promise(function(resolve, reject) {
            var reader = new FileReader();
            reader.onload = function() {
                resolve(reader.result);
            };
            reader.readAsText(blob);
        });
    }

    function recordsLoad(fs) {
        var files = [
            { recordTableFile: 'dvdbnd0.bhd5', dataTableFile: 'dvdbnd0.bdt' },
            { recordTableFile: 'dvdbnd1.bhd5', dataTableFile: 'dvdbnd1.bdt' },
        ];

        var records = {};
        return Promise.all(files.map(function(file) {
            var recordFile = fs.getFile(file.recordTableFile);
            var dataFile = fs.getFile(file.dataTableFile);
            return recordFile.load().then(loadBlob).then(function(buffer) {
                return BHD5.load(dataFile, records, buffer);
            });
        })).then(function() {
            return records;
        });
    }

    function ArchiveManager(fs) {
        this._fs = fs;
    }
    ArchiveManager.prototype._loadRecords = function() {
        return recordsLoad(this._fs).then(function(records) {
            this._records = records;
        }.bind(this));
    };
    ArchiveManager.prototype.load = function() {
        return this._loadRecords();
    };

    ArchiveManager.prototype._hashString = function(str) {
        var h = 0;
        str.toLowerCase().split('').forEach(function(chr) {
            h = ((37*h + chr.charCodeAt(0)) & 0xFFFFFFFF) >>> 0;
        });
        return h;
    };
    ArchiveManager.prototype.lookupRecord = function(filename) {
        var hash = this._hashString(filename);
        return this._records[hash];
    };

    function ModelCache(dunk) {
        this._dunk = dunk;
        this._cache = {};
    }
    ModelCache.prototype.loadModel = function(model) {
        var path = model.archivePath;
        if (!this._cache[path])
            this._cache[path] = this._dunk.archiveManager.lookupRecord(model.archivePath).loadDCX().then(FLVER.parse);
        return this._cache[path];
    };

    function Resources(dunk, textures) {
        this._dunk = dunk;
        this._textures = textures;
    }
    Resources.prototype._loadTextureFromBHD = function(name) {
        var key = name.split('\\').pop();
        key = key.replace('.tga', '.tpf.dcx');
        var record = this._textures[key];
        if (!record)
            return null;

        return record.loadDCX().then(TPF.parse).then(function(tpf) {
            return DDS.parse(tpf.textures[0].data);
        });
    };
    Resources.prototype._loadTextureFromTPF = function(name) {
        var key = name.split('\\').pop();
        key = key.replace('.tga', '');
        var texture = this._textures[key];
        if (!texture)
            return null;

        return Promise.resolve(DDS.parse(texture.data));
    };
    Resources.prototype.loadTexture = function(name) {
        var bhd = this._loadTextureFromBHD(name);
        if (bhd)
            return bhd;
        var tpf = this._loadTextureFromTPF(name);
        if (tpf)
            return tpf;
        return Promise.reject();
    };

    function Map(dunk, mapID, msb, resources) {
        this._dunk = dunk;
        this._mapID = mapID;
        this._msb = msb;
        this._resources = resources;
    }
    Map.prototype.buildModel = function(gl) {
        return Promise.all(this._msb.parts.filter(function(part) {
            if (part.type !== MSB.PartType.MapPiece)
                return false;
            return true;
        }).map(function(part) {
            var msbModel = this._msb.models[part.modelIndex];
            return this._dunk.modelCache.loadModel(msbModel).then(function(flver) {
                var model = GLRender.translateFLVER(gl, flver, this._resources);
                var m = model.localMatrix;
                mat4.translate(m, m, part.translation);
                mat4.rotateX(m, m, part.rotation[0] * Math.PI / 180);
                mat4.rotateY(m, m, part.rotation[1] * Math.PI / 180);
                mat4.rotateZ(m, m, part.rotation[2] * Math.PI / 180);
                mat4.scale(m, m, part.scale);
                return model;
            }.bind(this));
        }.bind(this))).then(function(models) {
            var model = {};
            model.draw = function(state) {
                models.forEach(function(model) {
                    model.draw(state);
                });
            };
            return model;
        });
    };

    function Driver() {
    }

    var MAP_FILES = [
        { state: 'm10_01_00_00', label: "Undead Burg / Parish" },
        { state: 'm10_00_00_00', label: "The Depths" },
        { state: 'm10_02_00_00', label: "Firelink Shrine" },
        { state: 'm11_00_00_00', label: "Painted World" },
        { state: 'm12_00_00_00', label: "Darkroot Forest" },
        { state: 'm12_00_00_01', label: "Darkroot Basin" },
        { state: 'm12_01_00_00', label: "Royal Wood" },
        { state: 'm13_00_00_00', label: "The Catacombs" },
        { state: 'm13_01_00_00', label: "Tomb of the Giants" },
        { state: 'm13_02_00_00', label: "Ash Lake" },
        { state: 'm14_00_00_00', label: "Blighttown" },
        { state: 'm14_01_00_00', label: "Demon Ruins" },
        { state: 'm15_00_00_00', label: "Sen's Fortress" },
        { state: 'm15_01_00_00', label: "Anor Londo" },
        { state: 'm16_00_00_00', label: "New Londo Ruins" },
        { state: 'm17_00_00_00', label: "Duke's Archives / Crystal Caves" },
        { state: 'm18_00_00_00', label: "Kiln of the First Flame" },
        { state: 'm18_01_00_00', label: "Undead Asylum" },
    ];

    function Dunk(fs) {
        this._fs = fs;
        this.archiveManager = new ArchiveManager(this._fs);
        this.modelCache = new ModelCache(this);

        this._canvas = document.createElement('canvas');
        document.body.appendChild(this._canvas);

        this.gl = this._canvas.getContext("experimental-webgl", { alpha: false });
    }
    Dunk.prototype.load = function() {
        return this.archiveManager.load().then(function() {
            return this._loadLoadScreen();
        }.bind(this)).then(function() {
            this._buildScene();
            this._buildUI();
            return this;
        }.bind(this));
    };
    Dunk.prototype._buildMapSelect = function() {
        var select = document.createElement('select');
        MAP_FILES.forEach(function(map) {
            var option = document.createElement('option');
            option.textContent = map.label;
            option.state = map.state;
            select.appendChild(option);
        });
        select.oninput = function() {
            var state = select.selectedOptions[0].state;
            this._loadState(state);
        }.bind(this);
        select.oninput();
        return select;
    };
    Dunk.prototype._buildUI = function() {
        var ui = document.createElement('div');
        ui.classList.add('map-select');
        var author = document.createElement('p');
        ui.appendChild(author);
        author.textContent = 'made by Jasper St. Pierre';
        var controls = document.createElement('p');
        controls.textContent = 'WASD, shift to go faster, B to reset the camera';
        ui.appendChild(controls);
        var select = this._buildMapSelect();
        ui.appendChild(select);
        document.body.appendChild(ui);
    };
    Dunk.prototype._resized = function() {
        this._canvas.width = window.innerWidth;
        this._canvas.height = window.innerHeight;
        this.gl.viewportWidth = this._canvas.width;
        this.gl.viewportHeight = this._canvas.height;
        this._scene.resized();
    };
    Dunk.prototype._buildScene = function() {
        this._scene = new GLRender.Scene(this.gl);
        this._camera = mat4.create();
        this._scene.setCamera(this._camera);
        this._resized();
        window.onresize = this._resized.bind(this);

        this._setupMainloop();
    };
    Dunk.prototype._loadBHD = function(bhdPath, bdtPath, records) {
        var bdt = this.archiveManager.lookupRecord(bdtPath);
        return this.archiveManager.lookupRecord(bhdPath).load().then(loadBlob).then(function(bhd) {
            records = records || [];
            return BHD.load(bdt, records, bhd);
        });
    };
    Dunk.prototype._loadMapTextures = function(mapID) {
        var textures = {};

        var loadTextureTPF = function(record) {
            return record.loadDCX().then(function(buffer) {
                var tpf = TPF.parse(buffer);
                tpf.textures.forEach(function(tex) {
                    textures[tex.name] = tex;
                });
            });
        };

        var tpf = function(path) {
            return loadTextureTPF(this.archiveManager.lookupRecord(path));
        }.bind(this);

        var bhd = function(path) {
            var bhdPath = path + '.tpfbhd';
            var bdtPath = path + '.tpfbdt';
            return this._loadBHD(bhdPath, bdtPath).then(function(records) {
                records.forEach(function(record) {
                    var filename = record.filename.split('\\').pop();
                    textures[filename] = record;
                });
            });
        }.bind(this);

        var mapKey = mapID.slice(0, 3); // "m10"
        var fileBase = '/map/' + mapKey + '/' + mapKey + '_';
        return Promise.all([
            bhd(fileBase + '0000'),
            bhd(fileBase + '0001'),
            bhd(fileBase + '0002'),
            bhd(fileBase + '0003'),
            tpf(fileBase + '9999.tpf.dcx'),
        ]).then(function() {
            return textures;
        });
    };
    Dunk.prototype._loadMSB = function(mapID) {
        var recordPath = '/map/MapStudio/' + mapID + '.msb';
        var msbFile = this.archiveManager.lookupRecord(recordPath);
        return msbFile.load().then(loadBlob).then(function(buffer) {
            return MSB.parse(mapID, buffer);
        });
    };
    Dunk.prototype.loadMap = function(mapID) {
        return Promise.all([
            this._loadMSB(mapID),
            this._loadMapTextures(mapID),
        ]).then(function(r) {
            var msb = r[0], textures = r[1];
            var resources = new Resources(this, textures);
            return new Map(this, mapID, msb, resources);
        }.bind(this));
    };
    Dunk.prototype._selectMap = function(mapID) {
        this._mapID = mapID;
        this._setLoading(true);
        return this.loadMap(mapID).then(function(map) {
            return map.buildModel(this.gl).then(function(model) {
                this._setLoading(false);
                this._setModels([model]);
            }.bind(this));
        }.bind(this));
    };
    Dunk.prototype._setLoading = function(loading) {
        this._loadScreen.classList.toggle('loading', loading);
    };
    Dunk.prototype._loadLoadScreen = function() {
        var nowloading = this.archiveManager.lookupRecord("/menu/nowloading.tpf.dcx");
        return nowloading.loadDCX().then(function(buffer) {
            var tpf = TPF.parse(buffer);
            var dds = DDS.parse(tpf.texturesByName['soul_sequence'].data);
            var imgData = dds.levels[0].decode();
            var anim = new Animation(imgData, 8, 4);

            var loadScreen = document.createElement('div');
            loadScreen.classList.add('load-screen');
            loadScreen.appendChild(anim.elem);
            anim.elem.classList.add('load-indicator');
            anim.start();
            document.body.appendChild(loadScreen);
            this._loadScreen = loadScreen;
            this._setLoading(true);
        }.bind(this));
    };
    Dunk.prototype._setupMainloop = function() {
        var keysDown = {};
        var dragging = false, lx = 0, ly = 0;
        var SHIFT = 16;
        var camera = this._camera;
        var canvas = this._canvas;

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

            var mult = 1;
            if (keysDown[SHIFT])
                mult *= 10;
            mult *= (dt / 32.0);

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

            this._stateUpdated();
            this._scene.setCamera(camera);
            this._scene.render();
            window.requestAnimationFrame(update);
        }.bind(this);

        var loadStateFromHash = function() {
            var hash = window.location.hash;
            if (!hash) hash = '';
            hash = hash.slice(1);
            this._loadState(hash);
        }.bind(this);

        window.addEventListener('hashchange', loadStateFromHash);
        loadStateFromHash();

        update(0);
    };
    Dunk.prototype._setModels = function(models) {
        this._scene.models = models;
    };

    Dunk.prototype._serializeState = function() {
        function serializeCamera(c) {
            var yaw = Math.atan2(-c[8], c[0]);
            var pitch = Math.asin(-c[6]);
            var posX = c[12];
            var posY = c[13];
            var posZ = c[14];
            return [yaw, pitch, posX, posY, posZ].map(function(n) { return n.toFixed(4); }).join(',');
        }

        return [this._mapID, serializeCamera(this._camera)].join('!');
    };
    Dunk.prototype._stateUpdated = function() {
        var state = this._serializeState();
        if (state === this._lastState)
            return;

        this._lastState = state;
        window.history.replaceState('', '', '#' + state);
    };
    Dunk.prototype._loadState = function(S) {
        function deserializeCamera(c, S) {
            var parts = S.split(',').map(function(n) { return parseFloat(n); });
            var yaw = parts[0];
            var pitch = parts[1];
            var posX = parts[2], posY = parts[3], posZ = parts[4];
            mat4.identity(c);
            mat4.rotateY(c, c, -yaw);
            mat4.rotateX(c, c, -pitch);
            c[12] = posX; c[13] = posY; c[14] = posZ;
        }

        var parts = S.split('!');
        var mapID = parts[0], cameraS = parts[1];
        if (!mapID)
            mapID = 'm10_01_00_00';

        this._selectMap(mapID);
        if (cameraS)
            deserializeCamera(this._camera, cameraS);
    };


    function globalLoad() {
        return getFileSystem().then(function(fs) {
            var dunk = new Dunk(fs);
            return dunk.load();
        });
    }

    function Animation(imageData, xCells, yCells) {
        this._imageData = imageData;
        this._xCells = xCells;
        this._yCells = yCells;

        this._frame = 0;
        this._numFrames = this._xCells * this._yCells;

        this._width = this._imageData.width / this._xCells;
        this._height = this._imageData.height / this._yCells;

        this._canvas = document.createElement('canvas');
        this._canvas.width = this._imageData.width;
        this._canvas.height = this._imageData.height;
        var ctx = this._canvas.getContext('2d');
        ctx.putImageData(this._imageData, 0, 0);

        this._container = document.createElement('div');
        this._container.appendChild(this._canvas);

        this._container.style.display = 'block';
        this._container.style.width = this._width + 'px';
        this._container.style.height = this._height + 'px';
        this._container.style.position = 'relative';
        this._container.style.overflow = 'hidden';

        this._canvas.style.position = 'absolute';
        this.elem = this._container;
    }
    Animation.prototype._update = function() {
        var yCell = (this._frame / this._xCells) | 0;
        var xCell = this._frame % this._xCells;

        var w = this._width, h = this._height;
        this._canvas.style.left = (-xCell * w) + 'px';
        this._canvas.style.top = (-yCell * h) + 'px';

        this._frame = (++this._frame) % this._numFrames;
        requestAnimationFrame(this._update.bind(this));
    };
    Animation.prototype.start = function() {
        this._update();
    };

    window.onload = function() {
        globalLoad();
    };

})(window);
