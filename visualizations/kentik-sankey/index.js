import React, { Fragment } from 'react';
import PropTypes from 'prop-types';
import { sankey, sankeyLinkHorizontal } from 'd3-sankey';
import { select } from 'd3-selection';

import {
  AutoSizer,
  Card,
  CardBody,
  HeadingText,
  NrqlQuery,
  Spinner,
  TableChart
} from 'nr1';
import { formatBytesGreek } from '../greekPrefixing';
import NoDataState from '../../src/no-data-state';
import NrqlQueryError from '../../src/nrql-query-error';
import colors from '../colors';

export default class SankeyVisualization extends React.Component {
  // Custom props you wish to be configurable in the UI must also be defined in
  // the nr1.json file for the visualization. See docs for more details.
  static propTypes = {
    /**
     * Chart Name
     */
    chartName: PropTypes.string,

    /**
     * An array of objects consisting of a nrql `query` and `accountId`.
     * This should be a standard prop for any NRQL based visualizations.
     */
    nrqlQueries: PropTypes.arrayOf(
      PropTypes.shape({
        accountId: PropTypes.number,
        query: PropTypes.string
      })
    ),

    /**
     * 1st dimension (Left side of Sankey)
     */
    dimensionLeft: PropTypes.string,

    /**
     * 2nd dimension (Right side of Sankey)
     */
    dimensionRight: PropTypes.string,

    showTable: PropTypes.bool
  };

  state = {
    popupPos: undefined,
    popupData: undefined
  };

  /**
   * Restructure the data for a non-time-series, facet-based NRQL query into a
   * form accepted by D3's Sankey.
   * https://github.com/d3/d3-sankey#sankey_nodes
   * SELECT sum(`kentik.rollup.bytes.rcv`) FROM Metric facet ip_address, country where country is not null SINCE 30 MINUTES AGO
   */
  transformFacetData = rawData => {
    const nodes = new Set();
    const links = [];

    // for now, assume we have 1 data value and 2 facets
    rawData.forEach(item => {
      const facets = item.metadata.groups.filter(
        group => group.type === 'facet'
      );
      const facet0 = `${facets[0].value}||${facets[0].name}`;
      const facet1 = `${facets[1].value}||${facets[1].name}`;

      nodes.add(facet0);
      nodes.add(facet1);

      links.push({ source: facet0, target: facet1, value: item.data[0].y });
    });

    return {
      nodes: Array.from(nodes).map(node => ({
        id: `${node}`,
        name: node.split('||')[0]
      })),
      links
    };
  };

  transformData = rawData => {
    const query = this.props.nrqlQueries[0].query;
    if (query.toLowerCase().includes('facet')) {
      return this.transformFacetData(rawData);
    } else {
      return this.transformEventData(rawData);
    }
  };

  /**
   * Restructure the data for a non-time-series, event-based NRQL query into a
   * form accepted by D3's Sankey.
   * https://github.com/d3/d3-sankey#sankey_nodes
   * SELECT src_geo, dst_geo, `bits/s_in`, `bits/s_out`, sample_rate from KFlow where dst_geo != '--' and src_geo != '--' and `bits/s_in` is not null and `bits/s_out` is not null since 7 days ago limit 100
   */
  transformEventData = rawData => {
    const { dimensionLeft, dimensionRight } = this.props;
    const nodes = {};
    const links = {};

    // for now, assume we have 1 data value and 2 facets
    rawData[0].data.forEach(item => {
      const leftKey = `${item[dimensionLeft]}-left`;
      const rightKey = `${item[dimensionRight]}-right`;
      const linkKey = `${item[dimensionLeft]}-${item[dimensionRight]}`;

      nodes[leftKey] = nodes[leftKey] || {
        id: leftKey,
        name: item[dimensionLeft] || '--'
      };
      nodes[rightKey] = nodes[rightKey] || {
        id: rightKey,
        name: item[dimensionRight] || '--'
      };

      links[linkKey] = links[linkKey] || {
        source: leftKey,
        target: rightKey,
        value: 0
      };
      links[linkKey].value += item.in_bytes * item.sample_rate;
    });

    return { nodes: Object.values(nodes), links: Object.values(links) };
  };

  validateNrql = () => {
    const { dimensionLeft, dimensionRight, nrqlQueries } = this.props;
    // Should these be required for aggregate queries? OR can we allow the user to aggregate their own query
    const requiredAttributes = ['in_bytes', 'sample_rate'];

    return [dimensionLeft, dimensionRight, ...requiredAttributes].every(item =>
      nrqlQueries[0].query.includes(item)
    );
  };

  setPopup = (link, event) => {
    this.setState({
      popupPos: { pageX: event.pageX, pageY: event.pageY },
      popupData: link
    });
  };

  closePopup = () => {
    this.setState({
      popupPos: undefined,
      popupData: undefined
    });
  };

  handleMouseEnter = (link, event) => {
    const d3Link = select(event.target);
    d3Link.style('stroke-opacity', 0.6);
    this.setPopup(link, event);
  };

  handleMouseLeave = (link, event) => {
    const d3Link = select(event.target);
    d3Link.style('stroke-opacity', 0.3);
    this.closePopup();
  };

  renderSankey = (data, width, height) => {
    const transformedData = this.transformData(data);

    const { nodes, links } = sankey()
      .nodeId(d => {
        return d.id;
      })
      .nodeWidth(36)
      .nodePadding(10)
      .extent([
        [1, 1],
        [width - 1, height - 5]
      ])(transformedData);

    return (
      <svg
        viewBox={`0 -5 ${width} ${height + 5}`}
        width={width}
        height={height}
      >
        <g style={{ mixBlendMode: 'multiply' }}>
          {nodes.map((node, i) => (
            <Fragment key={node.name}>
              <rect
                x={node.x0}
                y={node.y0}
                width={node.x1 - node.x0}
                height={Math.max(5, node.y1 - node.y0)}
                fill={colors[i]}
              >
                <title>{node.name}</title>
              </rect>

              <text
                x={node.x0 < width / 2 ? node.x1 + 6 : node.x0 - 6}
                y={(node.y1 + node.y0) / 2}
                dy="0.38em"
                textAnchor={node.x0 < width / 2 ? 'start' : 'end'}
              >
                {node.name}
              </text>
            </Fragment>
          ))}

          {links.map((link, i) => (
            <path
              key={i}
              d={sankeyLinkHorizontal()(link)}
              onMouseEnter={event => this.handleMouseEnter(link, event)}
              onMouseLeave={event => this.handleMouseLeave(link, event)}
              style={{
                fill: 'none',
                strokeOpacity: '0.3',
                stroke: colors[link.source.index],
                strokeWidth: Math.max(1, link.width)
              }}
            />
          ))}
        </g>
      </svg>
    );
  };

  renderPopup = width => {
    const { popupData = {}, popupPos } = this.state;
    const { source = {}, target = {}, value } = popupData;
    let visibility = 'hidden';
    let left = 0;
    let top = 0;

    if (popupPos) {
      left = `${width / 2}px`;
      top = `${Math.max(0, popupPos.pageY - 40)}px`;
      visibility = 'visible';
    }

    return (
      <Card className="tooltip" style={{ left, top, visibility }}>
        <HeadingText type={HeadingText.TYPE.HEADING_6}>
          {source.name} &#8594; {target.name}
        </HeadingText>

        {formatBytesGreek(value, '')}
      </Card>
    );
  };

  render() {
    const {
      chartName,
      dimensionLeft,
      dimensionRight,
      showTable,
      nrqlQueries
    } = this.props;

    const nrqlQueryPropsAvailable =
      dimensionLeft &&
      dimensionRight &&
      nrqlQueries &&
      nrqlQueries[0] &&
      nrqlQueries[0].accountId &&
      nrqlQueries[0].query &&
      this.validateNrql();

    if (!nrqlQueryPropsAvailable) {
      return <EmptyState />;
    }

    return (
      <Card className="container">
        {chartName && (
          <HeadingText type={HeadingText.TYPE.HEADING_6} className="chartName">
            {chartName}
          </HeadingText>
        )}

        <AutoSizer>
          {({ width, height }) => (
            <NrqlQuery
              query={nrqlQueries[0].query}
              accountId={parseInt(nrqlQueries[0].accountId)}
              pollInterval={NrqlQuery.AUTO_POLL_INTERVAL}
            >
              {({ data, loading, error }) => {
                if (loading) {
                  return <Spinner />;
                }
                if (error) {
                  return (
                    <NrqlQueryError
                      title="NRQL Syntax Error"
                      description={error.message}
                    />
                  );
                }

                if (data.length === 0) {
                  return <NoDataState />;
                }

                return (
                  <Card>
                    {this.renderSankey(
                      data,
                      width,
                      showTable ? height - 196 : height
                    )}

                    {showTable && (
                      <TableChart
                        data={data}
                        fullWidth
                        className="tableChart"
                      />
                    )}

                    {this.renderPopup(width, height)}
                  </Card>
                );
              }}
            </NrqlQuery>
          )}
        </AutoSizer>
      </Card>
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
        Please provide the Left and Right dimensions and at least one NRQL query
        &amp; account ID pair.
        <br />
        Your NRQL should include both dimensions, in_bytes, and sample_rate or a
        single aggregate and two facets for your left and right dimensions.
      </HeadingText>
      <HeadingText
        spacingType={[HeadingText.SPACING_TYPE.MEDIUM]}
        type={HeadingText.TYPE.HEADING_4}
      >
        An example NRQL query you can try is:
      </HeadingText>
      <code>
        FROM KFlow SELECT src_geo, dst_geo, in_bytes, sample_rate WHERE dst_geo
        != '--' AND src_geo != '--' AND src_geo IS NOT NULL OR dst_geo IS NOT
        NULL AND in_bytes IS NOT NULL SINCE 7 days ago LIMIT 1000
      </code>
      <HeadingText
        spacingType={[HeadingText.SPACING_TYPE.MEDIUM]}
        type={HeadingText.TYPE.HEADING_4}
      >
        An example NRQL query you can try is:
      </HeadingText>
      <code>
        FROM KFlow SELECT rate(sum(in_bytes*sample_rate)*8/1000/1000, 1 second)
        AS mbits FACET src_geo, dst_geo WHERE src_geo IS NOT NULL OR dst_geo IS
        NOT NULL SINCE 1 day ago
      </code>
    </CardBody>
  </Card>
);
