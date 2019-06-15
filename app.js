console.log('地图初始化！');

var api_status_desc = {};

$.ajax({
    url: "http://admin.334live.com/api/status/province",
    data: {
        // zipcode: 97201
    },
    success: function( result ) {
        console.log('接口：', result);
        var list = result.data
        for (var i=0; i<list.length; i++){
            api_status_desc[list[i].adcode] = list[i];
        }
        console.log('转换：', api_status_desc);
        // api_status_desc = result;


        

    }
});


// 创建地图
var map334 = new AMap.Map('container', {
    mapStyle: 'amap://styles/90346cc0e942938e7bc3fc166e300dd6', //设置地图的显示样式
    zoom: 4,
    zooms: [4, 10], // 设置可见级别，[最小级别，最大级别]
    center: [105.804852, 34.405203],//中心点坐标
});


// https://lbs.amap.com/api/javascript-api/reference-amap-ui/geo/district-explorer
//just some colors
var colors = [
    "#3366cc", "#dc3912", "#ff9900", "#109618", "#990099", "#0099c6", "#dd4477", "#66aa00",
    "#b82e2e", "#316395", "#994499", "#22aa99", "#aaaa11", "#6633cc", "#e67300", "#8b0707",
    "#651067", "#329262", "#5574a6", "#3b3eac"
];

AMapUI.load(['ui/geo/DistrictExplorer', 'lib/$'], function (DistrictExplorer, $) {
    //创建一个实例
    var districtExplorer = window.districtExplorer = new DistrictExplorer({
        eventSupport: true, //打开事件支持
        map: map334
    });

    //当前聚焦的区域
    var currentAreaNode = null;

    //鼠标hover提示内容
    var $tipMarkerContent = $('<div class="tipMarker top"></div>');

    var tipMarker = new AMap.Marker({
        content: $tipMarkerContent.get(0),
        offset: new AMap.Pixel(0, 0),
        bubble: true
    });

    //根据Hover状态设置相关样式
    function toggleHoverFeature(feature, isHover, position) {

        tipMarker.setMap(isHover ? map334 : null);

        if (!feature) {
            return;
        }

        var props = feature.properties;

        if (isHover) {

            //获得地区信息对象
            var popupInfo = api_status_desc[props.adcode];
            console.log(popupInfo);

            if (popupInfo){
                //更新提示内容
                $tipMarkerContent.html(`<div style="background-color: cadetblue; width: 100px; height: 300px">
    ${props.adcode} + ': ' + ${props.name}
    ${popupInfo.status_name}
    <img src="${popupInfo.cover_url}">
</div>`);
                //更新位置
                tipMarker.setPosition(position || props.center);
            }else{
                console.warn('No Message')
                $tipMarkerContent.html('加载中……')
            }

        }

        $('#area-tree').find('h2[data-adcode="' + props.adcode + '"]').toggleClass('hover', isHover);

        //更新相关多边形的样式
        var polys = districtExplorer.findFeaturePolygonsByAdcode(props.adcode);
        for (var i = 0, len = polys.length; i < len; i++) {

            polys[i].setOptions({
                fillOpacity: isHover ? 0.5 : 0.2
            });
        }
    }

    //监听feature的hover事件
    districtExplorer.on('featureMouseout featureMouseover', function (e, feature) {
        toggleHoverFeature(feature, e.type === 'featureMouseover',
            e.originalEvent ? e.originalEvent.lnglat : null);
    });

    //监听鼠标在feature上滑动
    districtExplorer.on('featureMousemove', function (e, feature) {

        //更新提示位置
        tipMarker.setPosition(e.originalEvent.lnglat);
    });

    //feature被点击
    districtExplorer.on('featureClick', function (e, feature) {

        var props = feature.properties;

        //如果存在子节点
        if (props.childrenNum > 0 && isProvince(props.adcode) ) {
            //切换聚焦区域
            switch2AreaNode(props.adcode);
        }
    });

    //外部区域被点击
    districtExplorer.on('outsideClick', function (e) {

        districtExplorer.locatePosition(e.originalEvent.lnglat, function (error, routeFeatures) {

            if (routeFeatures && routeFeatures.length > 1) {
                //切换到省级区域
                switch2AreaNode(routeFeatures[1].properties.adcode);
            } else {
                //切换到全国
                switch2AreaNode(100000);
            }

        }, {
            levelLimit: 2
        });
    });

    //绘制某个区域的边界
    function renderAreaPolygons(areaNode) {

        //更新地图视野
        map334.setBounds(areaNode.getBounds(), null, null, true);

        //清除已有的绘制内容
        districtExplorer.clearFeaturePolygons();

        //绘制子区域
        districtExplorer.renderSubFeatures(areaNode, function (feature, i) {

            var fillColor = colors[i % colors.length];
            var strokeColor = colors[colors.length - 1 - i % colors.length];

            return {
                cursor: 'default',
                bubble: true,
                strokeColor: strokeColor, //线颜色
                strokeOpacity: 1, //线透明度
                strokeWeight: 1, //线宽
                fillColor: fillColor, //填充色
                fillOpacity: 0.35, //填充透明度
            };
        });

        //绘制父区域
        districtExplorer.renderParentFeature(areaNode, {
            cursor: 'default',
            bubble: true,
            strokeColor: 'black', //线颜色
            strokeOpacity: 1, //线透明度
            strokeWeight: 1, //线宽
            fillColor: null, //填充色
            fillOpacity: 0.35, //填充透明度
        });
    }

    //切换区域后刷新显示内容
    function refreshAreaNode(areaNode) {

        districtExplorer.setHoverFeature(null);

        renderAreaPolygons(areaNode);

        //更新选中节点的class
        var $nodeEles = $('#area-tree').find('h2');

        $nodeEles.removeClass('selected');

        var $selectedNode = $nodeEles.filter('h2[data-adcode=' + areaNode.getAdcode() + ']').addClass('selected');

        //展开下层节点
        $selectedNode.closest('li').removeClass('hide-sub');

        //折叠下层的子节点
        $selectedNode.siblings('ul.sublist').children().addClass('hide-sub');
    }

    //切换区域
    function switch2AreaNode(adcode, callback) {

        if (currentAreaNode && ('' + currentAreaNode.getAdcode() === '' + adcode)) {
            return;
        }

        loadAreaNode(adcode, function (error, areaNode) {

            if (error) {

                if (callback) {
                    callback(error);
                }

                return;
            }

            currentAreaNode = window.currentAreaNode = areaNode;

            //设置当前使用的定位用节点
            districtExplorer.setAreaNodesForLocating([currentAreaNode]);

            refreshAreaNode(areaNode);

            if (callback) {
                callback(null, areaNode);
            }
        });
    }

    //加载区域
    function loadAreaNode(adcode, callback) {

        districtExplorer.loadAreaNode(adcode, function (error, areaNode) {

            if (error) {

                if (callback) {
                    callback(error);
                }

                console.error(error);

                return;
            }

            if (callback) {
                callback(null, areaNode);
            }
        });
    }

    function isProvince(adcode) {

        return adcode % 10000 === 0;

    }

/*
    $('#area-tree').on('mouseenter mouseleave', 'h2[data-adcode]', function (e) {

        if (e.type === 'mouseleave') {
            districtExplorer.setHoverFeature(null);
            return;
        }

        var adcode = $(this).attr('data-adcode');

        districtExplorer.setHoverFeature(currentAreaNode.getSubFeatureByAdcode(adcode));
    });


    $('#area-tree').on('click', 'h2[data-children-num]', function () {

        var adcode = $(this).attr('data-adcode');

        switch2AreaNode(adcode);
    });

    $('#area-tree').on('click', '.showHideBtn', function () {

        var $li = $(this).closest('li');

        $li.toggleClass('hide-sub');

        if (!$li.hasClass('hide-sub')) {

            //子节点列表被展开
            var $subList = $li.children('ul.sublist');

            //尚未加载
            if (!$subList.attr('data-loaded')) {

                $subList.attr('data-loaded', 'loading');

                $li.addClass('loading');

                //加载
                loadAreaNode($li.children('h2').attr('data-adcode'), function () {

                    $li.removeClass('loading');
                });
            }
        }
    });*/

    //全国
    switch2AreaNode(100000);
});


console.log('地图初始化完成！')