(function(exports) {
    "use strict";

    var FLVER = {};

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

    function read0StringW(buffer, offs) {
        var buf = new Uint16Array(buffer, offs);
        var L = [];
        for (var i = 0; i < 256; i++) {
            var c = buf[i];
            if (!c)
                break;
            L.push(String.fromCharCode(c));
        }
        return L.join('');
    }

    FLVER.formatAttrib = {
        Position:   0,
        jointIdx:    1,
        jointWeight: 2,
        Normal:     3,
        UV:         5,
        Bitangent:  6,
        Color:      10,
    };

    FLVER.parse = function(buffer) {
        var flver = {};

        var view = new DataView(buffer);
        assert(readString(buffer, 0x0, 0x06) == 'FLVER\0');

        var dataOffs = view.getUint32(0x0C, true);
        var dataSize = view.getUint32(0x10, true);

        var hitboxCount = view.getUint32(0x14, true);
        var materialCount = view.getUint32(0x18, true);
        var jointCount = view.getUint32(0x1C, true);
        var vtxInfoCount = view.getUint32(0x20, true);
        var batchCount = view.getUint32(0x24, true);
        var primitiveCount = view.getUint32(0x50, true);
        var vtxDescCount = view.getUint32(0x54, true);
        var mtdParamCount = view.getUint32(0x58, true);

        var offs = 0x80;

        function readHitbox() {
            offs += 0x40;
        }

        function readVec3() {
            var L = new Array(3);
            for (var i = 0; i < 3; i++) {
                L[i] = view.getFloat32(offs, true);
                offs += 0x04;
            }
            return L;
        }

        function lw() {
            return view.getUint32((offs += 0x04) - 0x04, true);
        }

        function readStringW() {
            var stringOffs = lw();
            return read0StringW(buffer, stringOffs);
        }

        function collect(n, f) {
            var L = new Array(n);
            for (var i = 0; i < n; i++)
                L[i] = f();
            return L;
        }

        flver.hitboxes = collect(hitboxCount, readHitbox);

        function readMaterial() {
            var mat = {};
            mat.name = readStringW();
            mat.mtdName = readStringW();
            mat.mtdParamCount = lw();
            mat.mtdParamStart = lw();
            mat.mtdParamEnd = mat.mtdParamStart + mat.mtdParamCount;

            // Unk.
            offs += 0x10;

            return mat;
        }

        flver.materials = collect(materialCount, readMaterial);

        function readjoint() {
            var joint = {};
            joint.translation = readVec3();
            joint.name = readStringW();
            joint.rotation = readVec3();

            joint.parentID = view.getUint16(offs, true);
            offs += 0x02;
            joint.firstChildID = view.getUint16(offs, true);
            offs += 0x02;

            joint.scale = readVec3();

            joint.firstSiblingID = view.getUint16(offs, true);
            offs += 0x02;
            joint.id = view.getUint16(offs, true);
            offs += 0x02;
            offs += 0x50;
            return joint;
        }

        flver.joints = collect(jointCount, readjoint);

        var jointStart = 0, primitiveStart = 0, vtxInfoStart = 0;
        function readbatch() {
            var batch = {};
            batch.flags = lw();
            batch.materialIdx = lw();

            // Unk.
            offs += 0x08;
            offs += 0x04;

            batch.jointStart = jointStart;
            batch.jointCount = lw();
            jointStart += batch.jointCount;
            // Unk.
            offs += 0x04;
            batch.jointOffs = lw();
            batch.primitiveStart = primitiveStart;
            batch.primitiveCount = lw();
            primitiveStart += batch.primitiveCount;
            batch.primitiveOffs = lw();
            batch.primitiveEnd = batch.primitiveStart + batch.primitiveCount;
            batch.vtxInfoStart = vtxInfoStart;
            batch.vtxInfoCount = lw();
            vtxInfoStart += batch.vtxInfoCount;
            batch.vtxInfoOffs = lw();
            return batch;
        }

        flver.batches = collect(batchCount, readbatch);

        function readprimitive() {
            var primitive = {};
            primitive.flags = lw();
            // Primitive type.
            primitive.drawType = view.getUint8(offs);
            // Have only seen tristrip so far.
            assert(primitive.drawType == 1);
            offs += 0x01;
            primitive.culling = view.getUint8(offs);
            offs += 0x01;
            // Pad / unk.
            offs += 0x02;
            primitive.idxCount = lw();
            var bufSize = primitive.idxCount * 2;
            var bufOffs = lw();
            // XXX: We should bind one big buffer instead of uploading separate ones.
            primitive.idxBufferData = new Uint16Array(buffer.slice(dataOffs + bufOffs, dataOffs + bufOffs + bufSize));
            // Unk.
            offs += 0x10;
            return primitive;
        }

        flver.primitives = collect(primitiveCount, readprimitive);

        function readVtxInfo() {
            var vtxInfo = {};

            // Unk.
            offs += 0x04;
            vtxInfo.vtxDescIdx = lw();
            // Unk.
            offs += 0x04;
            vtxInfo.vtxCount = lw();
            // Unk.
            offs += 0x08;
            var bufSize = lw();
            var bufOffs = lw();
            vtxInfo.vtxBufferData = new Float32Array(buffer.slice(dataOffs + bufOffs, dataOffs + bufOffs + bufSize));
            return vtxInfo;
        }

        flver.vtxInfos = collect(vtxInfoCount, readVtxInfo);

        var formatStart = 0;
        function readVtxDesc() {
            var vtxDesc = {};
            vtxDesc.formatStart = formatStart;
            vtxDesc.formatCount = lw();
            vtxDesc.formatEnd = vtxDesc.formatStart + vtxDesc.formatCount;
            formatStart += vtxDesc.formatCount;
            // Unk.
            offs += 0x08;
            offs += 0x04;
            return vtxDesc;
        }

        flver.vtxDescs = collect(vtxDescCount, readVtxDesc);

        function readMtdParam() {
            var mtdParam = {};
            mtdParam.value = readStringW();
            mtdParam.name = readStringW();
            // Unk.
            offs += 0x18;
            return mtdParam;
        }

        flver.mtdParams = collect(mtdParamCount, readMtdParam);

        var formatCount = 0;
        flver.vtxDescs.forEach(function(v) { formatCount += v.formatCount; });

        function readformat() {
            var format = {};
            // Unk.
            offs += 0x04;
            format.offset = lw();
            format.dataType = lw();
            format.attrib = lw();
            format.idx = lw();
            return format;
        }

        flver.formats = collect(formatCount, readformat);

        return flver;
    };

    exports.FLVER = FLVER;

})(window);
