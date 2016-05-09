(function(exports) {

    function LocalHttpFile(path) {
        this._path = path;
    };
    LocalHttpFile.prototype.load = function(offs, size) {
        return new Promise(function(resolve, reject) {
            return reject();

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

    function DataDragFileSystemFile(blob) {
        this._blob = blob;
    }
    DataDragFileSystemFile.prototype.load = function(offs, size) {
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

        this._container = document.createElement('div');
        this._container.style.background = '#666';
        this._container.style.width = '200px';
        this._container.style.height = '200px';
        this._container.ondragover = function(e) {
            this._container.style.background = '#aaa';
            e.preventDefault();
        }.bind(this);
        this._container.ondrop = function(e) {
            var transfer = e.dataTransfer;
            [].forEach.call(transfer.files, function(file) {
                this._files[file.name] = file;
            }.bind(this));
            e.preventDefault();
            this._loadComplete();
        }.bind(this);

        this._promise = new Promise(function(resolve, reject) {
            this._resolve = resolve;
        }.bind(this));

        document.body.appendChild(this._container);
    }
    DataDragFileSystem.prototype._loadComplete = function() {
        document.body.removeChild(this._container);
        this._resolve(this);
    };
    DataDragFileSystem.prototype.load = function() {
        return this._promise;
    };
    DataDragFileSystem.prototype.getFile = function(filename) {
        return new DataDragFileSystemFile(this._files[filename]);
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
            h = (37*h + chr.charCodeAt(0)) & 0xFFFFFFFF;
        });
        return h;
    };
    ArchiveManager.prototype.lookupRecord = function(filename) {
        var hash = this._hashString(filename);
        return this._records[hash];
    };

    function Dunk(fs) {
        this._fs = fs;
        this.archiveManager = new ArchiveManager(this._fs);
    }
    Dunk.prototype.load = function() {
        return Promise.all([
            this.archiveManager.load(),
        ]).then(function() {
            return this;
        }.bind(this));
    };

    function globalLoad() {
        return getFileSystem().then(function(fs) {
            var dunk = new Dunk(fs);
            return dunk.load();
        });
    }

    function Animation(fps, imageData, xCells, yCells) {
        this._fps = fps;
        this._timeout = 1000/fps;

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
        setTimeout(this._update.bind(this), this._timeout);
    };
    Animation.prototype.start = function() {
        setTimeout(this._update.bind(this), this._timeout);
    };

    function showLoadingAnimation(dunk) {
        var nowloading = dunk.archiveManager.lookupRecord("/menu/nowloading.tpf.dcx");
        return nowloading.loadDCX().then(function(data) {
            var tpf = TPF.parse(data);
            var dds = DDS.parse(tpf.texturesByName['soul_sequence'].data);
            var anim = new Animation(30, dds.levels[0], 8, 4);

            document.body.style = 'background: black';
            document.body.appendChild(anim.elem);
            anim.elem.classList.add('loading');
            anim.start();
        });
    }

    window.onload = function() {
        globalLoad().then(function(dunk) {
            showLoadingAnimation(dunk);
        });
    };

})(window);
