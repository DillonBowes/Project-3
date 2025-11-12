import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";

// config
const width = 1000,
  height = 600;

const svg = d3
  .select("#chart")
  .attr("viewBox", `0 0 ${width} ${height}`)
  .style("overflow", "visible");

const svg_state = d3
  .select("#state-chart")
  .style("overflow", "visible")
  .style("display", "none");

const tooltip = d3.select("#tooltip");
const stateName = document.querySelector("#state-name");

const geoURL =
  "https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json";
const dataURL = "new_avg_states_model.csv";

var plotName;
var selectedState = [];
var isSelected = false;
var legendVisible = true;
let updateYearLineGlobal = null;


Promise.all([d3.json(geoURL), d3.csv(dataURL)]).then(([geo, data]) => {
  data.forEach((d) => {
    d.tas_degree = +d.tas_degree;
    d.year = +d.year;
  });

  const models = Array.from(new Set(data.map((d) => d.model)));
  const modelSelect = d3.select("#modelSelect");
  modelSelect
    .selectAll("option")
    .data(models)
    .join("option")
    .text((d) => d);

  const usSeriesByModel = {};
  for (const m of models) {
    const arr = data.filter((d) => d.model === m);
    const rolled = d3.rollups(
      arr,
      (v) => d3.mean(v, (d) => d.tas_degree),
      (d) => d.year
    );
    usSeriesByModel[m] = rolled
      .map(([year, mean]) => ({ year: +year, mean: +mean }))
      .sort((a, b) => a.year - b.year);
  }

  const years = Array.from(new Set(data.map((d) => d.year))).sort(
    (a, b) => a - b
  );
  d3.select("#yearSlider")
    .attr("min", years[0])
    .attr("max", years[years.length - 1])
    .attr("value", years[0]);
  d3.select("#yearLabel").text(years[0]);

  const mainlandStates = geo.features.filter((feature) => {
    const name = feature.properties.name || feature.properties.NAME;
    return name !== "Alaska" && name !== "Puerto Rico" && name !== "Hawaii";
  });
  const mainlandGeo = {
    type: "FeatureCollection",
    features: mainlandStates,
  };
  const projection = d3.geoIdentity().fitSize([width, height], mainlandGeo);
  const path = d3.geoPath().projection(projection);

  const color = d3
    .scaleThreshold()
    .domain([3, 6, 9, 12, 15, 18, 21, 24])
    .range(d3.schemeRdYlBu[9].reverse());
  makeLegend(color);

  const g = svg
    .append("g")
    .attr("transform", `scale(1, -1) translate(0, -${height})`);

  let legendHover;
  const states = g
    .selectAll("path")
    .data(mainlandStates)
    .join("path")
    .attr("d", path)
    .attr("stroke", "#333")
    .attr("stroke-width", 0.5)
    .attr("class", "states")
    .on("mouseenter", (event) => {
      hoverOver(event.currentTarget);
      let hoverColor = event.currentTarget.getAttribute("fill");
      d3.select("#legend")
        .selectAll("rect")
        .nodes()
        .forEach((d) => {
          if (d.getAttribute("fill") === hoverColor) {
            hoverOver(d);
            legendHover = d;
          }
        });
    })
    .on("mouseleave", (event) => {
      hoverOut(event.currentTarget);
      if (legendHover) hoverOut(legendHover);
    });

  function update() {
    const model = modelSelect.node().value;
    const year = +d3.select("#yearSlider").node().value;
    d3.select("#yearLabel").text(year);

    const filtered = data.filter((d) => d.model === model && d.year === year);

    const lookup = {};
    filtered.forEach((d) => (lookup[d.state] = d.tas_degree));

    states
      .style("fill-opacity", 0.7)
      .attr("fill", (d) => {
        const name = d.properties.name;
        return lookup[name] ? color(lookup[name]) : "#ccc";
      })
      .on("mouseover", (event, d) => {
        const name = d.properties.name;
        const val = lookup[name];
        tooltip
          .style("display", "block")
          .style("left", event.clientX + 5 + "px")
          .style("top", event.clientY + 5 + "px")
          .html(
            `<b>${name}</b><br>${val ? val.toFixed(2) + " °C" : "No Data"}`
          );
      })
      .on("mouseout", () => tooltip.style("display", "none"))
      .on("click", (event, d) => {
        const usSeries = usSeriesByModel[model];
        if (event.currentTarget.getAttribute("fill") != "#ccc") {
          if (selectedState.length == 0) selectedState.push(event.currentTarget);

          if (isSelected) {
            if (event.currentTarget.classList.contains("selected")) {
              event.currentTarget.classList.remove("selected");
              isSelected = false;
              selectState();
              selectedState.pop();
              stateName.innerHTML =
                "Click a state to see temperature data aggregated by the chosen state";
            }
          } else {
            if (!event.currentTarget.classList.contains("selected")) {
              const name = d.properties.name;
              plotName = name;
              const filtered = data.filter(
                (d) => d.model === model && d.state === name
              );
              event.currentTarget.classList.add("selected");
              isSelected = true;
              selectState();
              moveStateToLeft(selectedState[0]);
              subplot(filtered, usSeries);
              stateName.innerHTML = "Click " + plotName + " to deselect";
            }
          }
        }
      });
  }

  modelSelect.on("change", (event) => {
    update();
    if (plotName) {
      const filtered = data.filter(
        (d) => d.model === event.target.value && d.state === plotName
      );
      const usSeries = usSeriesByModel[event.target.value];
      subplot(filtered, usSeries);
    }
  });

  d3.select("#yearSlider").on("input", function () {
    const year = +this.value;
    d3.select("#yearLabel").text(year);
    update();
  
    // Call global updater if subplot exists
    if (typeof updateYearLineGlobal === "function") {
      updateYearLineGlobal(year);
    }
  
  
    // Always update subplot if visible
    const updateYearLine = svg_state.property("updateYearLine");
    if (updateYearLine) updateYearLine(year);
  });
  
  update();
});

function selectState() {
  d3.select("#chart")
    .selectAll("path")
    .nodes()
    .forEach((s) => {
      if (s != selectedState[0]) {
        if (selectedState[0].classList.contains("selected")) {
          d3.select(s).style("opacity", "0").style("visibility", "hidden");
        } else {
          d3.select(s).style("opacity", "1").style("visibility", "visible");
        }
      }
    });
  legendVisible = !legendVisible;
  d3.select("#legend")
    .style("opacity", legendVisible ? 1 : 0)
    .style("visibility", legendVisible ? "visible" : "hidden");
  svg_state.style("display", legendVisible ? "none" : "block");
}

function hoverOver(target) {
  d3.select(target).style("fill-opacity", 1).style("stroke-width", 1.5);
}

function hoverOut(target) {
  d3.select(target).style("fill-opacity", 0.7).style("stroke-width", 0.5);
}

function makeLegend(colorScale) {
  const domain = colorScale.domain();
  const range = colorScale.range();

  const boxH = 22;
  const boxW = 25;
  const labelOffset = 35;

  const svgLengend = d3
    .select("#legend")
    .attr("width", 100 + labelOffset)
    .attr("height", range.length * boxH)
    .style("transition", "200ms")
    .style("overflow", "visible");

  const g = svgLengend.append("g").attr("transform", "translate(30,20)");
  let legendHover = [];

  range.forEach((color, i) => {
    g.append("rect")
      .attr("x", 0)
      .attr("y", (range.length - i - 1) * boxH)
      .attr("width", boxW)
      .attr("height", boxH)
      .attr("fill", color)
      .style("fill-opacity", 0.7)
      .attr("stroke", "#333")
      .style("stroke-width", 0.5)
      .attr("class", "states")
      .on("mouseenter", (event) => {
        hoverOver(event.currentTarget);
        d3.select("#chart")
          .selectAll("path")
          .nodes()
          .forEach((d) => {
            if (d.getAttribute("fill") === color) {
              hoverOver(d);
              legendHover.push(d);
            }
          });
      })
      .on("mouseleave", (event) => {
        hoverOut(event.currentTarget);
        legendHover.forEach((c) => hoverOut(c));
        legendHover = [];
      });

    let label;
    if (i === 0) label = "< " + domain[0];
    else if (i === range.length - 1) label = "> " + domain[domain.length - 1];
    else label = domain[i - 1] + " to " + domain[i];

    g.append("text")
      .attr("x", boxW + 5)
      .attr("y", (range.length - i - 1) * boxH + boxH / 1.5)
      .style("font-size", "11px")
      .text(label);
  });

  svgLengend
    .append("text")
    .attr("x", 0)
    .attr("y", 12)
    .style("font-weight", "bold")
    .style("font-size", "11px")
    .text("Temperature (°C)");
}

function subplot(stateData, usSeries) {
  svg_state.selectAll("*").remove();

  const margin = { top: 70, right: 40, bottom: 60, left: 70 },
    innerWidth = width - margin.left - margin.right,
    innerHeight = height - margin.top - margin.bottom;

  const g = svg_state
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3
    .scaleLinear()
    .domain(
      d3.extent(
        d3.merge([stateData.map((d) => d.year), usSeries.map((d) => d.year)])
      )
    )
    .range([0, innerWidth])
    .nice();

  const allTemps = [
    ...stateData.map((d) => d.tas_degree),
    ...usSeries.map((d) => d.mean),
  ];
  const y = d3
    .scaleLinear()
    .domain([d3.min(allTemps) - 0.3, d3.max(allTemps) + 0.3])
    .range([innerHeight, 0])
    .nice();

  g.append("g")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x).tickFormat(d3.format("d")))
    .call((g) =>
      g
        .append("text")
        .attr("x", innerWidth / 2)
        .attr("y", 45)
        .attr("fill", "black")
        .attr("text-anchor", "middle")
        .attr("font-size", 14)
        .text("Year")
    );

  g.append("g")
    .call(d3.axisLeft(y))
    .call((g) =>
      g
        .append("text")
        .attr("x", -innerHeight / 2)
        .attr("y", -50)
        .attr("transform", "rotate(-90)")
        .attr("fill", "black")
        .attr("text-anchor", "middle")
        .attr("font-size", 14)
        .text("Temperature (°C)")
    );

  g.append("g")
    .call(d3.axisLeft(y).tickSize(-innerWidth).tickFormat(""))
    .attr("stroke-opacity", 0.08);

  const stateLine = d3
    .line()
    .x((d) => x(d.year))
    .y((d) => y(d.tas_degree))
    .curve(d3.curveMonotoneX);

  const usLine = d3
    .line()
    .x((d) => x(d.year))
    .y((d) => y(d.mean))
    .curve(d3.curveMonotoneX);

  g.append("path")
    .datum(usSeries)
    .attr("fill", "none")
    .attr("stroke", "#444")
    .attr("stroke-width", 2)
    .attr("stroke-dasharray", "6 4")
    .attr("d", usLine);

  g.append("path")
    .datum(stateData)
    .attr("fill", "none")
    .attr("stroke", "#007acc")
    .attr("stroke-width", 2.5)
    .attr("d", stateLine);

  // --- Year line (vertical dotted line) ---
  // --- Year line and label ---
const yearLine = g.append("line")
.attr("class", "year-line")
.attr("stroke", "black")
.attr("stroke-width", 1.5)
.attr("stroke-dasharray", "4 4")
.attr("y1", 0)
.attr("y2", innerHeight)
.attr("opacity", 0.8);

// const yearLabelText = g.append("text")
// .attr("class", "year-label")
// .attr("y", -10)
// .attr("text-anchor", "middle")
// .attr("font-size", 12)
// .attr("fill", "#990000");


function updateYearLine(year) {
    const xPos = x(year);
    const yPos = innerHeight * 0.25; // 25% down from top of plot area (relative positioning)
  
    yearLine
      .attr("x1", xPos)
      .attr("x2", xPos);
  
//     yearLabelText
//       .attr("x", xPos + 20)  // slight horizontal offset so text doesn’t overlap the line
//       .attr("y", yPos - 55)      // vertical placement stays relative to chart height
//       .text(year);
//   }
    d3.select(".legend-year").text("Year: " + year);

}
      
      

  const currentYear = +d3.select("#yearSlider").node().value;
  updateYearLine(currentYear);
  updateYearLineGlobal = updateYearLine;

  svg_state.property("updateYearLine", updateYearLine);

  const trendState = linearTrend(stateData, "year", "tas_degree");
  const trendUS = linearTrend(usSeries, "year", "mean");
  const slopeStateDecade = trendState.slope * 10;
  const slopeUSDecade = trendUS.slope * 10;

  const compare =
    slopeStateDecade > slopeUSDecade
      ? "Rising faster than the U.S. average"
      : "Rising slower than the U.S. average";

  g.append("text")
    .attr("x", innerWidth / 2)
    .attr("y", -40)
    .attr("text-anchor", "middle")
    .attr("font-size", 16)
    .attr("font-weight", "bold")
    .text(
      "Average Annual Near Surface Temperature of " +
        plotName +
        " (2015 ~ 2100)"
    );

  g.append("text")
    .attr("x", innerWidth / 2)
    .attr("y", -18)
    .attr("text-anchor", "middle")
    .attr("font-size", 13)
    .attr("fill", "#555")
    .text(
      `${stateData[0].state} warming at ${slopeStateDecade.toFixed(
        2
      )}°C per decade under ${
        stateData[0].model
      } (2015–2100). ${compare} (${slopeUSDecade.toFixed(2)}°C).`
    );

  const legend = g.append("g").attr("transform", `translate(10, 10)`);

  legend
    .append("rect")
    .attr("x", -5)
    .attr("y", -5)
    .attr("width", 140)
    .attr("height", 70)
    .attr("fill", "white")
    .attr("stroke", "#ccc")
    .attr("opacity", 0.8);

  legend
    .append("line")
    .attr("x1", 0)
    .attr("x2", 24)
    .attr("y1", 8)
    .attr("y2", 8)
    .attr("stroke", "#007acc")
    .attr("stroke-width", 2.5);
  legend
    .append("text")
    .attr("x", 32)
    .attr("y", 12)
    .attr("font-size", 12)
    .text("State");

  legend
    .append("line")
    .attr("x1", 0)
    .attr("x2", 24)
    .attr("y1", 28)
    .attr("y2", 28)
    .attr("stroke", "#444")
    .attr("stroke-width", 2)
    .attr("stroke-dasharray", "6 4");
  legend
    .append("text")
    .attr("x", 32)
    .attr("y", 32)
    .attr("font-size", 12)
    .text("U.S. mean");
    // year label (dynamic text)
    legend
    .append("line")
    .attr("x1", 0)
    .attr("x2", 24)
    .attr("y1", 48)
    .attr("y2", 48)
    .attr("stroke", "#a30000") // dark red, consistent with year line
    .attr("stroke-width", 2)
    .attr("stroke-dasharray", "5 5");
  
  legend
    .append("text")
    .attr("class", "legend-year")
    .attr("x", 32)
    .attr("y", 52)
    .attr("font-size", 12)
    .text("Year: " + d3.select("#yearSlider").node().value);

  function linearTrend(data, xKey, yKey) {
    const n = data.length;
    const sumX = d3.sum(data, (d) => d[xKey]);
    const sumY = d3.sum(data, (d) => d[yKey]);
    const sumXY = d3.sum(data, (d) => d[xKey] * d[yKey]);
    const sumXX = d3.sum(data, (d) => d[xKey] * d[xKey]);
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    return { slope, intercept };
  }
}

function moveStateToLeft(selection) {
  const container = d3.select("#chart");
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const targetX = (viewportWidth * 5) / 100;
  const targetY = (viewportHeight * 37.5) / 100;

  const bbox = selection.getBBox();
  const currentCenterX = bbox.x + bbox.width / 2;
  const currentCenterY = bbox.y + bbox.height / 2;
  const translateXPixels = targetX - currentCenterX;
  const translateYPixels = targetY - currentCenterY;

  const translateXvw = (translateXPixels / viewportWidth) * 100;
  const translateYvh = (translateYPixels / viewportHeight) * 100;

  const selectClass = document.querySelector(".selected");
  let offset = 0;
  switch (plotName) {
    case "Montana":
    case "Texas":
      offset = 5;
      break;
    case "Iowa":
    case "Missouri":
    case "Nevada":
    case "Idaho":
    case "New York":
      offset = 2.5;
      break;
    case "Illinois":
    case "Wisconsin":
    case "Pennsylvania":
    case "Arizona":
    case "New Mexico":
      offset = 2;
      break;
    case "Oregon":
    case "Washington":
    case "Colorado":
    case "Minnesota":
    case "Wyoming":
      offset = 3.5;
      break;
    case "Oklahoma":
    case "Nebraska":
    case "Florida":
    case "North Carolina":
      offset = 4.25;
      break;
    case "California":
    case "Kansas":
    case "South Dakota":
    case "North Dakota":
    case "Tennessee":
    case "Michigan":
    case "Kentucky":
    case "Virginia":
      offset = 4;
      break;
    case "Utah":
    case "Arkansas":
    case "Louisiana":
    case "Mississippi":
    case "Alabama":
    case "Georgia":
    case "South Carolina":
    case "West Virginia":
    case "Ohio":
    case "Maryland":
      offset = 1.5;
      break;
    case "Indiana":
    case "Massachusetts":
    case "Maine":
      offset = 1;
      break;
    default:
      break;
  }

  if (selectClass) {
    selectClass.style.setProperty("--x", translateXvw - offset + "vw");
    selectClass.style.setProperty("--y", translateYvh + "vh");
  }
}
