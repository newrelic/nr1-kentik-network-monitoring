import React from 'react';
import PropTypes from 'prop-types';

import {
  AutoSizer,
  Card,
  CardBody,
  HeadingText,
  NrqlQuery,
  Spinner,
  TableChart
} from 'nr1';
import { LatLngBounds } from 'leaflet';
import { Map, GeoJSON, Popup, TileLayer } from 'react-leaflet';

import colors from '../colors';
import { formatBytesGreek } from '../greekPrefixing';
import { getCountryMapData } from './getMapData';

const mapTiles =
  'https://stamen-tiles-{s}.a.ssl.fastly.net/toner-lite/{z}/{x}/{y}.png';
const mapAttr =
  'Map tiles by <a href="http://stamen.com">Stamen Design</a>, under <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a>. Data by <a href="http://openstreetmap.org">OpenStreetMap</a>, under <a href="http://www.openstreetmap.org/copyright">ODbL</a>.';

// these don't work because the component is getting passed null for its prop values... and nr1.json doesn't support default values
const defaultProps = {
  trafficDirection: 'dst_geo',
  initialLat: 30,
  initialLng: -40,
  initialZoom: 3
};

export default class KentikMapVisualization extends React.Component {
  static propTypes = {
    accountId: PropTypes.number, // NRQL Query `accountId`
    trafficDirection: PropTypes.string,
    showTable: PropTypes.bool,
    autoZoom: PropTypes.bool,
    initialLat: PropTypes.number,
    initialLng: PropTypes.number,
    initialZoom: PropTypes.number
  };

  // these don't work because the component is getting passed null for its prop values... and nr1.json doesn't support default values
  static defaultProps = defaultProps;

  state = {
    popupPos: null,
    popupFeature: null
  };

  dataMap = {};

  transformData = data => {
    return data.map((item, index) => {
      const countryGroup = item.metadata.groups.find(
        item => item.type === 'facet' && item.name === 'country'
      );
      const country = countryGroup?.value;
      const countryData = country ? getCountryMapData(country) : {};

      if (country) {
        this.dataMap[country] = {
          ...item,
          index,
          sum: item.data.reduce((acc, dataItem) => acc + dataItem.y, 0)
        };
      }

      return countryData;
    });
  };

  getDataForCountry = country => this.dataMap[country] || {};

  getMapBounds = data => {
    let maxLon;
    let maxLat;
    let minLon;
    let minLat;

    const bounds = data.filter(item => !!item.bounds).map(item => item.bounds);

    if (bounds.length === 0) {
      return undefined;
    }

    bounds.forEach(bound => {
      const {
        minLon: currMinLon,
        minLat: currMinLat,
        maxLon: currMaxLon,
        maxLat: currMaxLat
      } = bound;

      minLon = minLon === undefined ? currMinLon : Math.min(minLon, currMinLon);
      minLat = minLat === undefined ? currMinLat : Math.min(minLat, currMinLat);
      maxLon = maxLon === undefined ? currMaxLon : Math.max(maxLon, currMaxLon);
      maxLat = maxLat === undefined ? currMaxLat : Math.max(maxLat, currMaxLat);
    });

    if (maxLat === minLat && maxLon === minLon) {
      maxLat += 1;
      minLat -= 1;
      maxLon += 1;
      minLon -= 1;
    }

    return new LatLngBounds(
      { lng: minLon, lat: minLat },
      { lng: maxLon, lat: maxLat }
    );
  };

  setPopup = event => {
    this.setState({
      popupPos: event ? event.latlng : null,
      popupFeature: event ? event.target.feature : null
    });
  };

  handleClosePopup = () => {
    this.setState({
      popupPos: null,
      popupFeature: null
    });
  };

  handleStyleFeature = feature => {
    // const { properties } = feature;
    const data = this.getDataForCountry(feature.id);

    if (data) {
      return {
        color: '#000',
        weight: 1,
        fillColor: colors[data.index],
        fillOpacity: 0.75
      };
    }

    return {};
  };

  handleEachFeature = (feature, layer) => {
    layer.on('mouseover', this.setPopup, this);
    layer.on('mouseout', this.handleClosePopup, this);
  };

  renderMap = data => {
    const { autoZoom } = this.props;
    const initialLat = this.props.initialLat || defaultProps.initialLat;
    const initialLng = this.props.initialLng || defaultProps.initialLng;
    const initialZoom = this.props.initialZoom || defaultProps.initialZoom;

    const { popupPos, popupFeature } = this.state;
    const transformedData = this.transformData(data);

    return (
      <Map
        center={[initialLat, initialLng]}
        zoom={initialZoom}
        bounds={autoZoom ? this.getMapBounds(transformedData) : undefined}
      >
        <TileLayer attribution={mapAttr} url={mapTiles} />

        <GeoJSON
          data={transformedData}
          style={this.handleStyleFeature}
          onEachFeature={this.handleEachFeature}
        />

        {popupPos && (
          <Popup position={popupPos} closeButton={false}>
            <HeadingText type={HeadingText.TYPE.HEADING_6}>
              {popupFeature.properties.name}
            </HeadingText>
            {formatBytesGreek(
              this.getDataForCountry(popupFeature.id).sum,
              'bits/s'
            )}
          </Popup>
        )}
      </Map>
    );
  };

  render() {
    const { accountId, showTable } = this.props;
    const trafficDirection =
      this.props.trafficDirection || defaultProps.trafficDirection;
    const query = `SELECT max(sentByteRate) AS 'bps' FROM (FROM KFlow SELECT rate(sum(in_bytes)*8, 1 second) AS 'sentByteRate' FACET ${trafficDirection} WHERE ${trafficDirection} IS NOT NULL) FACET ${trafficDirection} as 'country' WHERE sentByteRate > 0 SINCE 1 day ago`;
    const nrqlQueryPropsAvailable = !!accountId && !!trafficDirection;

    if (!nrqlQueryPropsAvailable) {
      return <EmptyState />;
    }

    return (
      <AutoSizer>
        {({ height }) => (
          <NrqlQuery
            query={query}
            accountIds={[parseInt(accountId)]}
            pollInterval={NrqlQuery.AUTO_POLL_INTERVAL}
          >
            {({ data, loading, error }) => {
              if (loading) {
                return <Spinner />;
              }
              if (error) {
                return <ErrorState />;
              }

              return (
                <Card style={{ height: height }}>
                  <Card style={{ height: showTable ? height - 176 : height }}>
                    {this.renderMap(data)}
                  </Card>

                  {showTable && (
                    <TableChart data={data} fullWidth className="tableChart" />
                  )}
                </Card>
              );
            }}
          </NrqlQuery>
        )}
      </AutoSizer>
    );
  }
}

const EmptyState = () => (
  <Card className="EmptyState">
    <CardBody className="EmptyState-cardBody">
      <HeadingText
        spacingType={[HeadingText.SPACING_TYPE.LARGE]}
        type={HeadingText.TYPE.HEADING_3}
      >
        Please select your Account ID
      </HeadingText>
    </CardBody>
  </Card>
);

const ErrorState = () => (
  <Card className="ErrorState">
    <CardBody className="ErrorState-cardBody">
      <HeadingText
        className="ErrorState-headingText"
        spacingType={[HeadingText.SPACING_TYPE.LARGE]}
        type={HeadingText.TYPE.HEADING_3}
      >
        Oops! Something went wrong.
      </HeadingText>
    </CardBody>
  </Card>
);
