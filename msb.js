(function(exports) {

    function assert(b) {
        if (!b) XXX;
    }

    function readString(buffer, offs, length) {
        var buf = new Uint8Array(buffer, offs, length);
        var L = new Array(length);
        for (var i = 0; i < length; i++)
            L[i] = String.fromCharCode(buf[i]);
        return L.join('');
    }

    function read0String(buffer, offs) {
        var buf = new Uint8Array(buffer, offs);
        var L = [];
        for (var i = 0; i < 256; i++) {
            var c = buf[i];
            if (!c)
                break;
            L.push(String.fromCharCode(c));
        }
        return L.join('');
    }

    function Model(msb, name, type, filename) {
        this.msb = msb;
        this.name = name;
        this.type = type;
        this.filename = filename;
        this.archivePath = this._getArchivePath();
    }
    Model.prototype._getArchivePath = function() {
        var mapID = this.msb.mapID;
        return '/map/' + mapID + '/' + this.name + 'A' + mapID.slice(1, 3) + '.flver.dcx';
    };

    function Part(msb, name, type, modelIndex, translation, rotation, scale) {
        this.msb = msb;
        this.name = name;
        this.type = type;
        this.modelIndex = modelIndex;
        this.translation = translation;
        this.rotation = rotation;
        this.scale = scale;
    }
    MSB.PartType = {
        MapPiece:  0x00,
        Object:    0x01,
        Entity:    0x02,
        Collision: 0x05,
    };

    function MSB(mapID) {
        this.mapID = mapID;

        this.models = [];
        this.events = [];
        this.points = [];
        this.parts = [];
    }

    MSB.parse = function(mapID, buffer) {
        var msb = new MSB(mapID);

        var view = new DataView(buffer);
        var offs = 0;

        function readModel(offs) {
            var baseOffs = offs;

            var nameOffs = view.getUint32(offs, true);
            offs += 0x04;
            var name = read0String(buffer, baseOffs + nameOffs);

            var type = view.getUint32(offs, true);
            offs += 0x04;

            // unk
            offs += 0x04;

            var filenameOffs = view.getUint32(offs, true);
            var filename = read0String(buffer, baseOffs + filenameOffs);
            return new Model(msb, name, type, filename);
        }

        assert(view.getUint32(offs, true) == 0);
        offs += 0x04;
        assert(read0String(buffer, view.getUint32(offs, true)) == 'MODEL_PARAM_ST');
        offs += 0x04;
        var modelCount = view.getUint32(offs, true) - 1;
        offs += 0x04;
        for (var i = 0; i < modelCount; i++) {
            var modelOffs = view.getUint32(offs, true);
            offs += 0x04;
            msb.models.push(readModel(modelOffs));
        }

        function readEvent(offs) {
        }

        // Chain to next chunk.
        offs = view.getUint32(offs, true);

        assert(view.getUint32(offs, true) == 0);
        offs += 0x04;
        assert(read0String(buffer, view.getUint32(offs, true)) == 'EVENT_PARAM_ST');
        offs += 0x04;
        var eventCount = view.getUint32(offs, true) - 1;
        offs += 0x04;
        for (var i = 0; i < eventCount; i++) {
            var eventOffs = view.getUint32(offs, true);
            offs += 0x04;
            msb.events.push(readEvent(eventOffs));
        }

        function readPoint(offs) {
        }

        // Chain to next chunk.
        offs = view.getUint32(offs, true);

        assert(view.getUint32(offs, true) == 0);
        offs += 0x04;
        assert(read0String(buffer, view.getUint32(offs, true)) == 'POINT_PARAM_ST');
        offs += 0x04;
        var pointCount = view.getUint32(offs, true) - 1;
        offs += 0x04;
        for (var i = 0; i < pointCount; i++) {
            var pointOffs = view.getUint32(offs, true);
            offs += 0x04;
            msb.points.push(readEvent(pointOffs));
        }

        function readPart(offs) {
            var baseOffs = offs;

            var nameOffs = view.getUint32(offs, true);
            offs += 0x04;
            var name = read0String(buffer, baseOffs + nameOffs);

            var type = view.getUint32(offs, true);
            offs += 0x04;

            // unk
            offs += 0x04;

            var modelIndex = view.getUint32(offs, true);
            offs += 0x04;

            function readVec3() {
                var L = new Array(3);
                for (var i = 0; i < 3; i++) {
                    L[i] = view.getFloat32(offs);
                    offs += 0x04;
                }
                return L;
            }

            // unk
            offs += 0x04;

            var translation = readVec3();
            var rotation = readVec3();
            var scale = readVec3();

            return new Part(msb, name, type, modelIndex, translation, rotation, scale);
        }

        // Chain to next chunk.
        offs = view.getUint32(offs, true);

        assert(view.getUint32(offs, true) == 0);
        offs += 0x04;

        assert(read0String(buffer, view.getUint32(offs, true)) == 'PARTS_PARAM_ST');
        offs += 0x04;
        var partCount = view.getUint32(offs, true) - 1;
        offs += 0x04;
        for (var i = 0; i < partCount; i++) {
            var partOffs = view.getUint32(offs, true);
            offs += 0x04;
            msb.parts.push(readPart(partOffs));
        }

        return msb;
    };

    exports.MSB = MSB;

})(window);
