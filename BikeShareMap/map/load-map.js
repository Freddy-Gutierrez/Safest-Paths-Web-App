var map;
var directionsService;
var directionsRenderer;
var userPos;
var losAngelesLatLng = { lat: 34.0522, lng: -118.2437 };
var permissions;
var gettingDirections = false;
var markers = new Array();
var currentStation = -1;
// array for all stations
var stations = new Array();
//array holding all li elements with station info
var stationsList = new Array();
var pathMarkers = new Array();
var bikeAccidents = new Array();
var heatmapEntries = new Array();
var polylinePaths = new Array();
// variable for disabling draw button
var canDraw = false;
var polylineOptionsActual;

async function getStations() {
  const response = await fetch("https://bikeshare.metro.net/stations/json/");
  const myJson = await response.json(); //extract JSON from the http response
  result = myJson.features;
  createListItems(result);
  return result;
}

function initMap() {
  map = new google.maps.Map(document.getElementById("map"), {
    center: losAngelesLatLng,
    zoom: 10,
    mapTypeId: "terrain",
  });
  // add legend as a control to the map
  var legend = document.getElementById("legend");
  legend.style.display = "none";
  map.controls[google.maps.ControlPosition.LEFT_BOTTOM].push(legend);

  // add zoom_changed listener
  map.addListener("zoom_changed", function () {
    hideListItems();
  });
  // add heatmap layer to map
  heatmap = new google.maps.visualization.HeatmapLayer({
    data: getBikeAccidents(),
    map: map,
  });
  polylineOptionsActual = new google.maps.Polyline({
    strokeColor: "#0088FF",
    strokeOpacity: 1.0,
    strokeWeight: 3,
  });
  // instantiate a derictionsService and directionsRenderer map that will be used to calculate route and display steps to the user
  directionsService = new google.maps.DirectionsService();
  directionsRenderer = new google.maps.DirectionsRenderer({
    polylineOptions: polylineOptionsActual,
  });
  directionsRenderer.setMap(map);
  directionsRenderer.setPanel(document.getElementById("directionsPanel"));
  addMapButtons();
  // make api call to stations
  getStations().then(function (result) {
    placeStationMarkers(result);
  });
}

function placeStationMarkers(result) {
  var markerId = 0;
  // for each station:
  // get the stations lat and lng values
  // create a marker at that stations position, as well as an infowindow that will be displayed on the hover of a marker
  // create a string that will be displayed in an infowindow on the hover of a marker
  result.forEach(function (station) {
    stations.push(station);
    var props = station.properties;
    var stationInfo =
      props.addressStreet +
      ", " +
      props.addressCity +
      ", " +
      props.addressZipCode +
      "<br>   Classic Bikes: " +
      props.classicBikesAvailable +
      "<br>   Smart Bikes: " +
      props.smartBikesAvailable +
      "<br>   Electric Bikes: " +
      props.electricBikesAvailable;
    var stationPos = {
      lat: station.geometry.coordinates[1],
      lng: station.geometry.coordinates[0],
    };
    var marker = new google.maps.Marker({
      id: markerId,
      position: stationPos,
      map: map,
      icon:
        props.kioskType === 1
          ? "../logos/normalBike.png"
          : "../logos/smartBike.png",
      title: props.addressCity,
      animation: null,
    });
    var stationInfoWindow = new google.maps.InfoWindow({
      content: stationInfo,
      map: map,
      position: stationPos,
    });
    stationInfoWindow.close();
    // mouseover a marker displays an infowindow with some information
    marker.addListener("mouseover", function () {
      stationInfoWindow.open(map, this);
    });
    // mouseout closes the infowindow
    marker.addListener("mouseout", function () {
      stationInfoWindow.close();
    });
    // on the click of a marker calculate directions using
    marker.addListener("click", function (e) {
      if (permissions) {
        if (heatmap.getMap() === map) heatmap.setMap(null);
        clearMarkers();
        stationInfoWindow.close();
        var start = userPos;
        var end = new google.maps.LatLng(e.latLng.lat(), e.latLng.lng());
        getStationRoute(directionsService, directionsRenderer, start, end);
      }
    });
    markers.push(marker);
    markerId++;
  });
}
// calculates best route to user and displays directions
function getStationRoute(directionsService, directionsRenderer, start, end) {
  directionsRenderer.setMap(map);
  directionsRenderer.setPanel(document.getElementById("directionsPanel"));

  gettingDirections = true;
  var request = {
    origin: start,
    destination: end,
    travelMode: "DRIVING",
  };

  openNav();

  directionsService.route(request, function (result, status) {
    if (status == "OK") {
      // set paths
      console.log(result);
      directionsRenderer.setDirections(result);
    } else {
      alert("Error Fetching Directions");
    }
  });
}
// calculates best route to user and displays directions
function getBikeRoutes(directionsService, directionsRenderer, start, end) {
  directionsRenderer.setMap(map);
  directionsRenderer.setPanel(document.getElementById("directionsPanel"));
  var request = {
    origin: start,
    destination: end,
    provideRouteAlternatives: true,
    travelMode: "BICYCLING",
  };

  openNav();

  polylinePaths = [];
  directionsService.route(request, function (result, status) {
    if (status == "OK") {
      console.log(result);
      var weight = 0;
      for (ind = 0; ind < result.routes.length; ind++) {
        // create a polyline for each route using each route's legs > steps > paths
        var weight = 0;
        var polyline = new google.maps.Polyline({
          path: result.routes[ind].overview_path,
          strokeColor: "#FF0000",
          strokeWeight: 3,
        });
        var bounds = new google.maps.LatLngBounds();
        // check if each heatmap entry is on or near our polyline path
        for (i = 0; i < heatmapEntries.length; i++) {
          var accidentCoords = new google.maps.LatLng(
            heatmapEntries[i].location.lat(),
            heatmapEntries[i].location.lng()
          );
          // isLocationOnEdge is a function of the GOOGLE MAPS GEOMETRY LIBRARY that when given a polyline can check to see if a coordinate is on or within a certain distance of that polyline
          if (
            google.maps.geometry.poly.isLocationOnEdge(
              accidentCoords,
              polyline,
              0.00036 // tolerance degrees
            )
          ) {
            weight += heatmapEntries[i].weight;
            console.log("true");
            // display a marker at accident near route
            // var marker = new google.maps.Marker({
            //   position: accidentCoords,
            //   map: map
            // });
          }
        }
        // check if polyline needed in future
        polylinePaths.push({
          id: ind,
          pl: polyline,
          bnd: bounds,
          wt: weight,
          color: "black",
        });
      }
      // set paths
      directionsRenderer.setDirections(result);
      // sort paths by lowest to highest weights
      polylinePaths.sort((a, b) => a.wt - b.wt);
      // change the color of the path for each entry in polylinePaths array
      polylinePaths.forEach(function (p, ind) {
        if (ind === 0) p.color = "#00ff00";
        else if (ind === 1) p.color = "#ffff00";
        else p.color = "#ff0000";
      });
      console.log(polylinePaths);
      // set the initial path equal to the color of the corresponding polyline path
      // after being sorted the initial route might be  third in the polylinePaths array
      polylineOptionsActual.setOptions({ strokeColor: getPoly(0).color });
      // add listener to directionsRenderer for when user clicks on a suggested path, then display corresponding polyline
      google.maps.event.addListener(
        directionsRenderer,
        "routeindex_changed",
        function () {
          //current routeIndex
          // poly.pl.setMap(null);
          var routeInd = this.getRouteIndex();
          polylineOptionsActual.setOptions({
            strokeColor: getPoly(routeInd).color,
          });
        }
      );
      createLegend();
    } else {
      alert("Error Fetching Directions");
    }
  });
}
// returns polyline object with corresponding ID
function getPoly(id) {
  for (i = 0; i < polylinePaths.length; i++)
    if (polylinePaths[i].id === id) return polylinePaths[i];
}

function createLegend() {
  var legend = document.getElementById("legend");
  legend.innerHTML = "<h3>Legend</h3>";
  legend.style.display = "block";
  console.log(legend);

  polylinePaths.forEach(function (p, ind) {
    var div = document.createElement("div");
    var logo;
    if (ind === 0) logo = "../logos/greenline.png";
    else if (ind === 1) logo = "../logos/yellowline.png";
    else logo = "../logos/redline.png";

    div.innerHTML =
      "<img src=" + logo + ">" + " route: " + p.id + ", safety rating: " + p.wt;
    legend.appendChild(div);
  });
}

function resetMap() {
  if (heatmap.getMap() === map) heatmap.setMap(null);
  if (currentStation !== -1) removeHighlight(currentStation);
  // resets legend
  document.getElementById("legend").style.display = "none";
  gettingDirections = false;
  // removes all listeners on the map
  google.maps.event.clearListeners(map, "click");
  canDraw = false;
  resetMarkers();
  map.setZoom(10);
  map.panTo(losAngelesLatLng);
  // resets polyline array to empty
  polylinePaths = [];
  directionsRenderer.setMap(null);
  directionsRenderer.setPanel(null);
  polylineOptionsActual.setOptions({ strokeColor: "#0088FF" });

  closeNav();
}

function resetMarkers() {
  markers.forEach(function (m) {
    m.setVisible(true);
  });
  // if there are active pathmarkers on the map, remove them from map then reset pathmarkers array
  if (pathMarkers.length > 0) {
    pathMarkers.forEach(function (pm) {
      pm.setVisible(false);
    });
    pathMarkers = [];
  }
}

function clearMarkers() {
  markers.forEach(function (m) {
    m.setVisible(false);
  });
}

function getUserLocation() {
  infoWindow = new google.maps.InfoWindow();
  // Try HTML5 geolocation.
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      function (position) {
        (permissions = true),
          (userPos = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        // infoWindow.setPosition(pos);
        // infoWindow.setContent("Location found.");
        // infoWindow.open(map);
        var marker = new google.maps.Marker({
          position: userPos,
          map: map,
          animation: google.maps.Animation.DROP,
          title: "Your Position",
        });
      },
      function () {
        permissions = false;
        handleLocationError(true, infoWindow, map.getCenter());
      }
    );
  } else {
    // Browser doesn't support Geolocation
    handleLocationError(false, infoWindow, map.getCenter());
  }
}
// handle error is user location not found
function handleLocationError(browserHasGeolocation, infoWindow, pos) {
  infoWindow.setPosition(pos);
  infoWindow.setContent(
    browserHasGeolocation
      ? "Error: The Geolocation service failed."
      : "Error: Your browser doesn't support geolocation."
  );
  infoWindow.open(map);
}
// toggles heatmap on map
function toggleHeatmap() {
  clearMarkers();
  heatmap.setMap(heatmap.getMap() ? null : map);
}
// parse csv file to array using "Papa Parse" api link: https://www.papaparse.com/
// for each bikeAccident create a weighted heatmap object and push to heatmapEntries array
// push each accident to bikeAccidents as well, object contains all info about accident, not just lat/lng/weight used for heatmap
function getBikeAccidents() {
  var cvs = Papa.parse("http://localhost:8000/CSV_Files/bikeAccidents.csv", {
    header: true,
    download: true,
    worker: true,
    step: function (accident) {
      bikeAccidents.push(accident);
      var entry = {
        location: new google.maps.LatLng(accident.data.Y, accident.data.X),
        weight: Number(accident.data.collision_severity),
      };
      heatmapEntries.push(entry);
    },
    complete: function () {
      // console.log("bike accidents", bikeAccidents);
      console.log("heatmap entries", heatmapEntries);
      console.log("All done");
      getCities();
    },
  });
  return heatmapEntries;
}
// add the start and end points of your bike path
function getBikeStops() {
  var mapClicked = 0;
  var bikeStartStop = new Array();
  var pointMarker;
  // add onclick listener to map and get the latlng at that click
  map.addListener("click", addLatLng);

  function addLatLng(event) {
    // after two clicks
    if (mapClicked == 1) {
      // disable the draw button
      google.maps.event.clearListeners(map, "click");
      canDraw = false;
      var btn = document.getElementById("drawButton");
      btn.style.background = "#808080";
      // set the directionsrenderer
      directionsRenderer.setMap(map);
      directionsRenderer.setPanel(document.getElementById("directionsPanel"));
      // add the second bikestop to array
      bikeStartStop.push(event.latLng);
      pointMarker.setVisible(false);
      // calculate the route using bikeStartStop array
      getBikeRoutes(
        directionsService,
        directionsRenderer,
        bikeStartStop[0],
        bikeStartStop[1]
      );
    } else {
      mapClicked++;
      bikeStartStop.push(event.latLng);
      pointMarker = new google.maps.Marker({
        position: event.latLng,
        map: map,
      });
    }
  }
}
// filters station based on select value from user
function filterStations() {
  var select = document.getElementById("cities");
  var city = select[select.selectedIndex].value;
  // optimize solution so we don't have to iterate through entire array each time
  markers.forEach(function (marker) {
    if (city === "All Data") marker.setVisible(true);
    else if (city === marker.title) {
      marker.setVisible(true);
    } else {
      marker.setVisible(false);
    }
  });
}

function createListItems(result) {
  // initialize stationsId to 0
  var stationId = 0;
  // get the ul html element from metro-bike-map.html
  var listDiv = document.getElementById("stationList");
  // for each station:
  result.forEach(function (station) {
    // get text that will be displayed in each list item
    var props = station.properties;
    var stationInfo =
      props.addressStreet +
      ", " +
      props.addressCity +
      ", " +
      props.addressZipCode +
      "<br>   Classic Bikes: " +
      props.classicBikesAvailable +
      "<br>   Smart Bikes: " +
      props.smartBikesAvailable +
      "<br>   Electric Bikes: " +
      props.electricBikesAvailable;
    // create an img dom element and add in id and src
    var image = document.createElement("img");
    image.setAttribute("id", "image");
    image.src =
      "http://www.rafu.com/wp-content/uploads/2016/07/metro-bike-share-station-junko.png";
    // create  a div element to wrap the img
    divIm = document.createElement("div");
    divIm.setAttribute("id", "imgDiv");
    divIm.appendChild(image);
    // create a div and p element to wrap the the text
    divText = document.createElement("div");
    divText.setAttribute("id", "divText");
    p = document.createElement("p");
    p.innerHTML = stationInfo;
    divText.appendChild(p);
    // create the list element with the attributes below
    var listItem = document.createElement("li");
    listItem.setAttribute("class", "list-group-item");
    listItem.setAttribute("id", stationId);
    listItem.setAttribute("onclick", "addHighlight(" + stationId + ")");
    // listItem.setAttribute("onmouseleave", "removeHighlight(" + stationId + ")");
    // append the divIm and divText to the list item created above
    listItem.appendChild(divIm);
    listItem.appendChild(divText);
    // push the created list item to stationsList array to reference when needed
    stationsList.push(listItem);
    stationId++;
    // appened the list item to the element
    listDiv.appendChild(listItem);
  });
}

// for each item in the given array make the list item either visisble or not
function hideListItems() {
  if (!gettingDirections) {
    for (var i = 0; i < markers.length; i++) {
      if (map.getBounds().contains(markers[i].getPosition())) {
        var itemTOShown = document.getElementById(markers[i].id);
        itemTOShown.setAttribute("style", "display: block;");
        markers[i].setVisible(true);
      } else {
        var itemTOBeHidden = document.getElementById(markers[i].id);
        itemTOBeHidden.setAttribute("style", "display: none;");
        markers[i].setVisible(false);
      }
    }
  }
}
// border to current list item by accessing it using the stationId in the stationsList array
function addHighlight(stationId) {
  if (stationId != currentStation && currentStation != -1)
    removeHighlight(currentStation);
  currentStation = stationId;
  console.log(currentStation);
  stationsList[stationId].style.border = "thick solid blue";
  center = stations[stationId].geometry.coordinates;
  var stationPos = {
    lat: center[1],
    lng: center[0],
  };
  map.panTo(stationPos);
  markers[stationId].setAnimation(google.maps.Animation.BOUNCE);
}
// remove the border by changing it to white
function removeHighlight(stationId) {
  stationsList[stationId].style.border = "thick solid white";
  markers[stationId].setAnimation(null);
  // console.log(markers[stationId]);
}
// add custom buttons to the google maps map
// google maps has a controls array that holds buttons that are displayed on the map. By default the buttons the map comes with are displayed, but can be
// turned off when you create the map. You can add more buttons by pushing your custome button to the array.
function addMapButtons() {
  // Add button for user location
  var locationButton = document.createElement("button");
  locationButton.setAttribute(
    "style",
    "background: #fff; border:none; outline:none; width:30px; height:30px; border-radius:2px; box-shadow:0 1px 4px rgba(0,0,0,0.3); cursor:pointer; margin-right:10px; padding:0px;"
  );
  var locationIcon = document.createElement("span");
  locationIcon.setAttribute("class", "oi oi-target");
  locationButton.appendChild(locationIcon);
  //locationButton.innerHTML = "<img src='../logos/location-icon.jpg' height='20px' width='20px' margin='5px'>";
  map.controls[google.maps.ControlPosition.RIGHT_BOTTOM].push(locationButton);
  google.maps.event.addDomListener(locationButton, "click", function () {
    getUserLocation();
  });
  var toggletHeatMapButton = document.createElement("button");
  toggletHeatMapButton.setAttribute(
    "style",
    "height: 20px; width: 120px; margin: 5px; border: 1px solid; padding: 1px 12px; font: bold 11px Roboto, Arial, sans-serif; color: #000000; background-color: #b1ffff; cursor: pointer;"
  );
  toggletHeatMapButton.innerHTML = "Toggle Heatmap";
  map.controls[google.maps.ControlPosition.BOTTOM_CENTER].push(
    toggletHeatMapButton
  );
  google.maps.event.addDomListener(toggletHeatMapButton, "click", function () {
    toggleHeatmap();
    // heatmap.setMap(heatmap.getMap() ? null : map);
  });
  var drawButton = document.createElement("button");
  drawButton.setAttribute(
    "style",
    "border: none; border-radius: 50%; height: 32px; width: 32px; margin-right: 10px; padding: 0px; border: 1px solid; background-color: #808080; color: #000000; cursor: pointer;"
  );
  drawButton.setAttribute("id", "drawButton");
  var icon = document.createElement("span");
  icon.setAttribute(
    "style",
    "width: 16px; height: 16px;  position: absolute; top: 50%; left: 50%; height: 50%;  transform: translate(-50%, -50%); margin-right: 20px;"
  );
  icon.setAttribute("class", "oi oi-pencil");
  drawButton.appendChild(icon);
  map.controls[google.maps.ControlPosition.RIGHT_TOP].push(drawButton);
  google.maps.event.addDomListener(drawButton, "click", function () {
    if (!canDraw) {
      canDraw = true;
      this.style.background = "#b1ffff";
      polylinePaths = [];
      directionsRenderer.setMap(null);
      directionsRenderer.setPanel(null);
      getBikeStops();
    } else {
      canDraw = false;
      this.style.background = "#808080";
      getBikeStops();
    }
  });
  var resestMapButton = document.createElement("button");
  resestMapButton.setAttribute(
    "style",
    "height: 20px; width: 120px; margin: 5px; border: 1px solid; padding: 1px 12px; font: bold 11px Roboto, Arial, sans-serif; color: #000000; background-color: #b1ffff; cursor: pointer;"
  );
  resestMapButton.innerHTML = "Reset Map";
  map.controls[google.maps.ControlPosition.BOTTOM_CENTER].push(resestMapButton);
  google.maps.event.addDomListener(resestMapButton, "click", function () {
    resetMap();
  });
}
// dynamically add the cities of the stations to the 'cities' drop down
function getCities() {
  var cities = [];
  var select = document.getElementById("cities");
  stations.forEach(function (station) {
    var city = station.properties.addressCity;
    if (cities.includes(city));
    else {
      cities.push(city);
      var op = document.createElement("option");
      op.setAttribute("value", city);
      op.innerHTML = city;
      select.appendChild(op);
    }
  });
}

// Hnadles the side Nav Bar Directions
function openNav() {
  document.getElementById("mySidenav").style.width = "30%";
  document.getElementById("main").style.marginRight = "30%";
}

function closeNav() {
  document.getElementById("mySidenav").style.width = "0";
  document.getElementById("main").style.marginRight = "0";
}
