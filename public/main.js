const App = {
  animation_time_ms: 200,
  balance: null,
  dust_tokens_value: 100000,
  invoices: {},
  is_decoding_request: false,
  is_getting_balance: false,
  minimum_tokens_number: 0.00000001,
  notification_show_ms: 3000,
  sent_payments: {},
  wallet_id: null,
  ws: null,
  ws_reconnect_time_ms: 5000,
};

/** Request the addition of a peer

  {
    address: <Public Key and Host String>
  }
*/
App.addPeer = (args, cbk) => {
  if (!args.address) {
    return cbk([0, 'Expected adddress']);
  }

  const [publicKey, host] = args.address.split('@');

  $.ajax({
    contentType: 'application/json',
    data: JSON.stringify({host, public_key: publicKey}),
    type: 'POST',
    url: `/v0/peers/`,
  })
  .done((res) => cbk())
  .fail((r) => cbk([r.status, r.statusText]))

  return;
};

/** Cancel active payment
*/
App.cancelPayment = (args) => {
  $('.preparing-send .request').val('');
  $('.presented.wallet-error').remove();
  App.changedRequestInput();

  return;
};

/** Changed request input
*/
App.changedRequestInput = e => {
  const requestInput = $('.preparing-send .request');

  const request = requestInput.val().trim();

  if (request === '') {
    $('.cannot-send, .payment-preview').prop('hidden', true);

    return;
  }

  if (request === '0') {
    App.clickedPrepareReceive(e);

    return;
  }

  if (/^lightning:\/\//.test(request)) {
    requestInput.val(request.slice('lightning://'.length));

    return App.changedRequestInput();
  } else if (/^lightning:/.test(request)) {
    requestInput.val(request.slice('lightning:'.length));

    return App.changedRequestInput();
  }

  App.is_decoding_request = true;
  $('.payment-actions .prepare-receive .nav-link').addClass('text-muted');
  $('.payment-actions .prepare-receive .nav-link').removeClass('text-success');

  return App.getDecodedRequest({request}, (err, res) => {
    $('.payment-actions .prepare-receive .nav-link').addClass('text-success');
    $('.payment-actions .prepare-receive .nav-link').removeClass('text-muted');
    App.is_decoding_request = false;

    // Exit early if assumed state is changed
    if (request !== $('.preparing-send .request').val()) {
      return;
    }

    if (!!err) {
      $('.payment-preview').prop('hidden', true);

      return;
    }

    const amount = (res.tokens / 1e8).toFixed(8);
    const fiatAmount = res.fiat_value;
    const isExpired = res.expires_at < new Date().toISOString();

    $('.payment-preview').data('request', request);
    $('.payment-preview').data('is_establishing', !!res.is_establishing);
    $('.payment-preview').data('has_direct_channel', !!res.has_direct_channel);
    $('.payment-preview').data('payment_id', res.id);
    $('.payment-preview').data('payment_tokens', res.tokens);
    $('.payment-preview').prop('hidden', false);
    $('.payment-preview').hide();
    $('.payment-preview').show(App.animation_time_ms);
    $('.payment-preview .amount').text(`${amount} tBTC ($${fiatAmount} tUSD)`);
    $('.payment-preview .description').text(res.description || '');
    $('.payment-preview .recipient').prop('hidden', !res.recipient_name);

    $('.payment-preview .send')
    .prop('disabled', isExpired)
    .text(isExpired ? 'Payment Expired...' : 'Send Payment');

    if (!!res.recipient_url) {
      $('.payment-preview .recipient-link').prop('href', res.recipient_url);
    } else {
      $('.payment-preview .recipient-link').removeAttr('href');
    }

    $('.payment-preview .recipient-link')
    .prop('title', res.recipient_description);

    $('.payment-preview .recipient-link').text(res.recipient_name);

    $('.payment-preview .quote').prop('hidden', !res.description);
  });
};

/** Changed the receive amount input
*/
App.changedReceiveAmountInput = () => {
  const isAmountEmpty = !parseFloat($('.request-amount').val());

  $('.request-payment').toggleClass('collapse', isAmountEmpty);

  return true;
};

/** Claim welcome gift

  {
    wallet_id: <Wallet Id String>
  }

  @returns via cbk
  {
    fiat_value: <Fiat Value String>
    tokens: <Tokens Number>
  }
*/
App.claimWelcomeGift = (args, cbk) => {
  if (!args.wallet_id) {
    return cbk([0, 'Expected wallet id']);
  }

  $.post(`https://htlc.me/v0/gifts/${args.wallet_id}/claim/welcome`)
  .done((res) => {
    if (!res || !res.fiat_value || res.tokens === undefined) {
      return cbk([500, 'Expected fiat value, tokens', res]);
    }

    return cbk(null, {fiat_value: res.fiat_value, tokens: res.tokens});
  })
  .fail((r) => cbk([r.status, r.statusText]))

  return;
};

/** Clicked acknowledge welcome
*/
App.clickedAckWelcome = () => {
  $('.wallet-creation').hide(App.animation_time_ms);

  $('.initializing').prop('hidden', false);
  $('.initializing').hide();
  $('.initializing').show(App.animation_time_ms);

  App.claimWelcomeGift({wallet_id: App.wallet_id}, (err, res) => {
    $('.initializing').prop('hidden', true);

    if (!!err || res.tokens === undefined) {
      localStorage.clear();

      setTimeout(() => location.reload(), 5000);

      return;
    }

    App.startWebSocket({});

    $('.payment-actions, .wallet-balance').hide();
    $('.payment-actions, .wallet-balance').show(App.animation_time_ms);
    $('.show-on-start').prop('hidden', false);

    localStorage.wallet_id = App.wallet_id;

    if (!!res.tokens) {
      App.presentReceivedPayment({
        fiat_value: res.fiat_value,
        short_description: 'A welcome gift! Thanks for trying HTLC.me!',
        tokens: res.tokens,
      });
    }

    App.refreshBalance({});
  });

  return;
};

/** Clicked add peer
*/
App.clickedAddPeer = () => {
  $('.request-peer-addition.presented, .presented.wallet-error').remove();

  const card = $('.request-peer-addition.template').clone();

  card.removeClass('template').addClass('presented');

  card.find('form').submit(App.submitAddPeerForm);
  card.find('.cancel').click(() => card.remove());

  $('.transactions-break').after(card);

  card.hide();
  card.show(App.animation_time_ms);
};

/** Clicked cancel payment
*/
App.clickedCancelPayment = (e) => {
  e.preventDefault();

  App.cancelPayment({});

  return;
};

/** Clicked close card
*/
App.clickedCloseCard = function(e) {
  e.preventDefault();

  const card = $(this).closest('.card');

  card.hide(App.animation_time_ms);

  return setTimeout(() => card.remove(), App.animation_time_ms);
};

/** Clicked enable notifications
*/
App.clickedEnableNotifications = (e) => {
  Notification.requestPermission(() => {
    if (Notification.permission !== 'granted') {
      return;
    }

    $('.enable-notifications').hide(App.animation_time_ms);

    return;
  });

  return;
};

/** Clicked to navigate home
*/
App.clickedNavigateHome = (e) => {
  e.preventDefault();

  window.scrollTo(0, 0);

  return;
};

/** Clicked prepare recieve button
*/
App.clickedPrepareReceive = (e) => {
  e.preventDefault();

  if (!!App.is_decoding_request) {
    return;
  }

  $('.action-details').prop('hidden', true);
  $('.preparing-receive').prop('hidden', false);
  $('.top-action .active').removeClass('active');
  $('.prepare-receive .nav-link').addClass('active');
  $('.preparing-send .request').val('');
  $('.presented.wallet-error').remove();
  App.changedRequestInput();

  window.scrollTo(0, 0);

  $('.preparing-receive input').focus();

  return;
};

/** Clicked prepare send button
*/
App.clickedPrepareSend = (e) => {
  e.preventDefault();

  $('.top-action .active').removeClass('active');
  $('.prepare-send .nav-link').addClass('active');
  $('.action-details').prop('hidden', true);
  $('.preparing-receive input').val('');
  $('.preparing-send').prop('hidden', false);

  $('.preparing-send .request').focus();
  $('.presented.wallet-error').remove();

  window.scrollTo(0, 0);

  return;
};

/** Clicked present network button
*/
App.clickedPresentNetwork = (e) => {
  e.preventDefault();

  return App.switchToNetworkTab({});
};

/** Clicked send payment button

  FIXME: - abstract template logic
*/
App.clickedSendPayment = (e) => { 
  e.preventDefault();

  $('.preparing-send').submit();
};

/** Clicked the show network directory link
*/
App.clickedShowNetworkDirectory = (e) => {
  e.preventDefault();

  App.showNetworkDirectory({});

  return;
};

/** Clicked the show network graph button
*/
App.clickedShowNetworkGraph = (e) => {
  e.preventDefault();

  $('.network-directory.presented, .network-graph.presented').remove();

  const card = $('.network-graph.template').clone();

  card.removeClass('template').addClass('presented');

  $('.transactions-break').after(card);

  card.hide();
  card.show(App.animation_time_ms);

  card.find('.close').click(App.clickedCloseCard);

  App.getNetworkGraph({}, (err, graph) => {
    if (!!err) {
      $('.network-graph.presented').remove();

      return App.presentError({
        err: err,
        text: 'There was a problem fetching the network details. Try again?',
        title: 'Could not get network graph',
      });
    }

    const s = graph.own_node.channel_count === 1 ? '' : 's';

    $('.current-channel-count')
    .text(`HTLC.me is currently connected to the Lightning Network with ${graph.own_node.channel_count} active channel${s}.`);

    if (!graph.own_node.channel_count) {
      return $('.current-channel-count').text('HTLC.me is currently reconnecting to the Lightning Network.')
    }

    App.drawNetworkGraph({graph});
  });
};

/** Clicked the sign out button
*/
App.clickedSignOutButton = (e) => {
  localStorage.wallet_id = '';

  location.reload();

  return;
};

/** Clicked the start recovery button
*/
App.clickedStartRecovery = (e) => {
  e.preventDefault();

  $('.recovery').submit();

  return;
};

/** Clicked update node directory
*/
App.clickedUpdateDirectory = (e) => {
  e.preventDefault();

  window.scroll(0, 0);

  $('.node-registration.presented, .network-directory.presented').remove();

  const card = $('.node-registration.template').clone();

  card.removeClass('template').addClass('presented');

  $('.transactions-break').after(card);

  card.find('.cancel').on('click', (e) => {
    e.preventDefault();

    card.hide(App.animation_time_ms);

    setTimeout(() => card.remove(), App.animation_time_ms);

    return;
  });

  card.find('.copy-message').on('click', () => {
    card.find('.node-name-message').select();

    document.execCommand('copy');

    card.find('.copy-message .text').text('Copied!');

    setTimeout(() => {
      card.find('.copy-message .text').text('Copy');
    },
    3000);

    return;
  });

  card.find('.edit').on('input', () => {
    const nodeDetails = {
      node_description: card.find('.set-node-description').val(),
      node_name: card.find('.set-node-name').val(),
      node_url: card.find('.set-node-url').val(),
    };

    const serializedDetails = App.safeBase64Encode({json: nodeDetails});

    const messageToSign = `set_htlc.me_details:${serializedDetails}`;

    card.find('.node-name-message').val(messageToSign);
    card.find('.node-name-message').text(messageToSign);
  });

  card.find('.set-node-details').on('submit', (e) => {
    e.preventDefault();

    card.find('.set-node-name-btn').text('Setting node name...');

    $('.presented.wallet-error').remove();

    App.setNodeDetails({
      node_description: card.find('.set-node-description').val(),
      node_name: card.find('.set-node-name').val(),
      node_url: card.find('.set-node-url').val(),
      signature: card.find('.node-details-signature').val(),
    },
    (err) => {
      card.find('.set-node-name-btn').text('Set my node name');

      if (!!err) {
        App.presentError({
          err: err,
          text: 'Unexpected error updating the node name. Try again?',
          title: 'Error Setting Node Name',
        });

        return;
      }

      card.remove();

      App.presentUpdatedDirectory({});
    });

    return;
  });

  card.hide();
  card.show(App.animation_time_ms);

  return;
};

/** Create a chain invoice

  {
    invoice_id: <Invoice Id String>
  }

  @returns via cbk
  {
    invoice_link: <Invoice Link String>
  }
*/
App.createChainInvoice = (args, cbk) => {
  if (!args.invoice_id) {
    return cbk([0, 'Expected invoice id', args]);
  }

  $.ajax({
    contentType: 'application/json',
    data: JSON.stringify({invoice_id: args.invoice_id}),
    type: 'POST',
    url: `https://htlc.me/v0/invoices/chain/${App.wallet_id}/`,
  })
  .done((res) => {
    if (!res || !res.invoice_link) {
      return cbk([500, 'Expected invoice link', res]);
    }

    return cbk(null, {invoice_link: res.invoice_link});
  })
  .fail((r) => cbk([r.status, r.statusText]));

  return;
};

/** Create a new invoice

  {
    tokens: <Requested Tokens Number>
  }

  @returns via cbk
  {
    id: <Id String>
    request: <BOLT 11 Encoded Payment Request String>
  }
*/
App.createInvoice = (args, cbk) => {
  $.ajax({
    contentType: 'application/json',
    data: JSON.stringify({tokens: args.tokens}),
    type: 'POST',
    url: `https://htlc.me/v0/invoices/${App.wallet_id}/`,
  })
  .done(res => {
    if (!res || !res.id || !res.request) {
      return cbk([503, 'Expected id, request', res]);
    }

    return cbk(null, {
      fiat_value: res.fiat_value,
      id: res.id,
      request: res.request,
    });
  })
  .fail((r) => cbk([r.status, r.statusText]))

  return;
};

/** Draw network graph

  graph: {
    edges: [{}]
    nodes: [{}]
  }
  Graph from https://bl.ocks.org/rpgove/386b7a28977a179717a460f9a541af2a
*/
App.drawNetworkGraph = (args) => {
  const graph = args.graph;
  const height = 1500;
  const nodeRadius = d3.scaleSqrt().range([2, 5]);
  const width = 2500;

  let linkWidth = d3.scaleLinear().range([1, 1 * nodeRadius.range()[0]]);

  function dragStart(d) {
    if (!d3.event.active) {
      forceSim.alphaTarget(0.3).restart();
    }

    d.fx = d.x;
    d.fy = d.y;
  }

  function dragging (d) {
    d.fx = d3.event.x;
    d.fy = d3.event.y;
  }

  function dragEnd (d) {
    if (!d3.event.active) {
      forceSim.alphaTarget(0);
    }

    d.fx = null;
    d.fy = null;
  }

  const drag = d3.drag()
  .on('drag', dragging)
  .on('end', dragEnd)
  .on('start', dragStart);

  const svg = d3.select('svg')
  .attr('width', width + 2)
  .attr('height', height + 2)
  .append('g')
  .attr('transform', 'translate(1,1)');

  const groupingForce = forceInABox()
  .strength(0.1)
  .template('treemap')
  .groupBy('community')
  .size([width, height]);

  const forceSim = d3.forceSimulation()
  .force('link', d3.forceLink()
    .id((d) => d.id)
    .distance(150)
    .strength(groupingForce.getLinkStrength)
  )
  .force('group', groupingForce)
  .force('charge', d3.forceManyBody())
  .force('center', d3.forceCenter(width / 2, height / 2))
  .force('x', d3.forceX(width / 2).strength(0.02))
  .force('y', d3.forceY(height / 2).strength(0.04));

  // Make sure small nodes are drawn on top of larger nodes
  graph.nodes.sort((a, b) => b.last_update - a.last_update);

  nodeRadius.domain([
    graph.nodes[graph.nodes.length - 1].last_update,
    graph.nodes[0].last_update
  ]);

  linkWidth.domain(d3.extent(graph.edges, (d) => parseInt(d.last_update, 10)));

  forceSim.nodes(graph.nodes).on('tick', tick);

  forceSim.force('link').links(graph.edges);

  groupingForce.links(graph.edges).drawTreemap(svg);

  const link = svg.append('g')
  .attr('class', 'links')
  .selectAll('line')
  .data(graph.edges)
  .enter().append('line')
  .attr('stroke-width', (d) => linkWidth(d.last_update));

  const node = svg.append('g')
  .attr('class', 'nodes')
  .selectAll('circle')
  .data(graph.nodes)
  .enter().append('circle')
  .attr('r', (d) => nodeRadius(d.last_update))
  .call(drag);

  node.append('title').text((d) => d.alias);

  node.style('fill', (d) => d.color);

  node.attr('class', (d) => {
    if (!!d.is_self) {
      return 'self';
    } else if (!!d.is_registered) {
      return 'registered'
    } else {
      return '';
    }
  });

  function tick () {
    link
    .attr('x1', (d) => d.source.x)
    .attr('x2', (d) => d.target.x)
    .attr('y1', (d) => d.source.y)
    .attr('y2', (d) => d.target.y);

    node
    .attr('cx', (d) => d.x)
    .attr('cy', (d) => d.y);
  }

  window.scrollTo(0, 0);

  return;
};

/** Get the current wallet balance

  {
    wallet_id: <Wallet Id String>
  }

  @returns via cbk
  {
    balance: <Tokens Number>
    fiat_balance: <Fiat Balance String>
  }
*/
App.getBalance = (args, cbk) => {
  $.get(`https://htlc.me/v0/balances/${args.wallet_id}`, (res) => {
    if (!res || res.balance === undefined || res.fiat_balance === undefined) {
      return cbk([500, 'Expected balance, fiat balance', res]);
    }

    return cbk(null, {balance: res.balance, fiat_balance: res.fiat_balance});
  })
  .fail((r) => cbk([r.status, r.statusText]))

  return;
};

/** Get a decoded payment request

  {
    request: <BOLT 11 Encoded Payment Request String>
  }

  @returns via cbk
  {
    fiat_value: <Fiat Value String>
    has_direct_channel: <Has Direct Channel Bool>
    id: <Payment Id String>
    is_establishing: <Is Establishing Channel Bool>
    expires_at: <ISO 8601 Date String>
    recipient_description: <Recipient Description String>
    recipient_name: <Recipient Name String>
    recipient_url: <Recipient Url String>
    tokens: <Requested Tokens Number>
  }
*/
App.getDecodedRequest = (args, cbk) => {
  return $.get(`https://htlc.me/v0/decoded/invoice/${args.request}`, (r) => {
    if (!r || !r.id || r.tokens === undefined) {
      return cbk([500, 'Expected id, tokens', r]);
    }

    let description;

    try {
      const jsonDescription = JSON.parse(r.description);

      description = jsonDescription.d || jsonDescription.description;
    } catch (e) {
      description = r.description;
    }

    return cbk(null, {
      description,
      expires_at: r.expires_at,
      fiat_value: r.fiat_value,
      has_direct_channel: !!r.has_direct_channel,
      id: r.id,
      is_peer: !!r.is_peer,
      is_establishing: !!r.is_establishing_channel,
      recipient_description: r.recipient_description,
      recipient_name: r.recipient_name,
      recipient_url: r.recipient_url,
      tokens: r.tokens,
    });
  })
  .fail((r) => cbk([r.status, r.statusText]))
};

/** Get network directory

  {}

  @returns via cbk
  {
    custodial_node {
      ip: <Custodial LN Peer Ip String>
      public_key: <Custodial Identity Compressed Public Key Hex String>
    }
    nodes: [{
      description: <Node Description String>
      name: <Node Name String>
      public_key: <Public Key String>
      url: <Node Url String>
    }]
  }
*/
App.getNetworkDirectory = (args, cbk) => {
  $.get('https://htlc.me/v0/peers/directory')
  .done((res) => {
    if (!res || !Array.isArray(res.nodes)) {
      return cbk([500, 'Expected res, nodes', res]);
    }

    return cbk(null, res);
  })
  .fail((r) => cbk([r.status, r.statusText]));

  return;
};

/** Get network graph

  {}

  @returns via cbk
  {
    edges: [{
      capacity: <Channel Capacity Tokens Number>
      from_self: <Channel Link From Self Bool>
      last_update: <Last Update Epoch Seconds Number>
      source: <Source Public Key String>
      target: <Target Public Key String>
      to_self: <Target is Self Bool>
    }]
    nodes: [{
      alias: <Name String>
      community: <Community Grouping Number>
      id: <Node Public Key String>
      is_self: <Node is Self Bool>
      last_update: <Last Updated Seconds Number>
    }]
    own_node: {
      channel_count: <Total Channels Count Number>
      id: <Node Public Key String>
    }
  }
*/
App.getNetworkGraph = (args, cbk) => {
  $.get('https://htlc.me/v0/peers/graph')
  .done((graph) => {
    if (!graph || !graph.edges || !graph.nodes || !graph.own_node) {
      return cbk([500, 'Expected edges, nodes, own node', graph]);
    }

    return cbk(null, graph);
  })
  .fail((r) => cbk([r.status, r.statusText]))
};

/** Get swap rate

  {
    currency_code: <Currency Code String>
  }

  @returns via cbk
  {
    fiat_value: <Fiat Value String>
    max_swap_tokens: <Maximum Swappable Tokens Number>
    min_swap_tokens: <Minimum Swappable Tokens Number>
    rate: <Tokens per Unit Exchanged Number>
  }
*/
App.getSwapRate = (args, cbk) => {
  if (!args.currency_code) {
    return cbk([0, 'Expected currency code']);
  }

  return $.get(`https://htlc.me/v0/swaps/rate/${args.currency_code}`, (res) => {
    if (!res.fiat_value || !res.max_swap_tokens || !res.min_swap_tokens) {
      return cbk([503, 'Expected fiat value, max/max swap tokens']);
    }

    return cbk(null, {
      fiat_value: res.fiat_value,
      max_swap_tokens: res.max_swap_tokens,
      min_swap_tokens: res.min_swap_tokens,
      rate: res.rate,
    });
  })
  .fail((r) => cbk([r.status, r.statusText]));
};

/** Init app

  {}
*/
App.init = (args) => {
  App.wallet_id = App.uuid({});

  if (!!localStorage.wallet_id) {
    App.recoverWallet({wallet_id: localStorage.wallet_id});
    $('.initializing').hide();
    $('.initializing').prop('hidden', false);
    $('.initializing').show(App.animation_time_ms);
  }

  $('.wallet-creation').prop('hidden', !!localStorage.wallet_id);

  $('.ack-welcome').click(App.clickedAckWelcome);
  $('.add-peer').click(App.clickedAddPeer);
  $('.navigate-home').click(App.clickedNavigateHome);
  $('.payment-preview .cancel').click(App.clickedCancelPayment);
  $('.payment-preview .send').click(App.clickedSendPayment);
  $('.prepare-send .nav-link').click(App.clickedPrepareSend);
  $('.prepare-receive .nav-link').click(App.clickedPrepareReceive);
  $('.preparing-receive').on('submit', App.submitRequestPayment);
  $('.preparing-receive input').on('input', App.changedReceiveAmountInput);
  $('.preparing-receive input').on('paste', App.pastedInPreparingReceive);
  $('.preparing-send').on('submit', App.submitSendPayment);
  $('.preparing-send .request').on('input', App.changedRequestInput);
  $('.present-network .nav-link').click(App.clickedPresentNetwork);
  $('.recovery').on('submit', App.submitRecoveryForm);
  $('.show-network').click(App.clickedShowNetworkDirectory);
  $('.sign-out').click(App.clickedSignOutButton);
  $('.start-recovery').click(App.clickedStartRecovery);
  $('.view-network-graph').click(App.clickedShowNetworkGraph);
  $('.wallet-creation .wallet-id').val(App.wallet_id);

  $('.wallet-creation').hide();
  $('.wallet-creation').show(App.animation_time_ms);

  return;
};

/** Make an API request

  {
    api: <API String>
    [json]: <JSON Object>
  }
*/
App.makeRequest = (args, cbk) => {
  if (!args.api) {
    return cbk([0, 'Expected API']);
  }

  $.ajax({
    contentType: 'application/json',
    data: JSON.stringify(args.json),
    type: !!args.json ? 'POST' : 'GET',
    url: `/v0/${args.api}`,
  })
  .done((res) => cbk(null, res))
  .fail((r) => cbk([r.status, r.statusText]));

  return;
};

/** Pasted in preparing receive field
*/
App.pastedInPreparingReceive = (e) => {
  if (!e || !e.originalEvent || !e.originalEvent.clipboardData) {
    return;
  }

  const requestPrefix = 'ln';
  const pasteData = e.originalEvent.clipboardData.getData('text');

  if (pasteData.substring(0, requestPrefix.length) !== requestPrefix) {
    return;
  }

  App.clickedPrepareSend(e);
  $('.preparing-send .request').val(pasteData);
  App.changedRequestInput();

  return;
};

/** Perform a swap

  {
    currency_code: <Swap to Currency Code String>
    tokens: <Tokens Number>
    withdrawal_address: <Withdrawal Address String>
  }
*/
App.performSwap = (args, cbk) => {
  if (!args.currency_code || !args.tokens) {
    return cbk([0, 'Expected currency code, tokens']);
  }

  $.ajax({
    contentType: 'application/json',
    data: JSON.stringify({
      tokens: args.tokens,
      wallet_id: App.wallet_id,
      withdrawal_address: args.withdrawal_address,
    }),
    type: 'POST',
    url: `/v0/swaps/trade_for/${args.currency_code}`,
  })
  .done(payment => {
    return cbk(null, {
      description: payment.description,
      fee: payment.fee,
      fiat_value: payment.fiat_value,
      hops: payment.hops,
      recipient_name: payment.recipient_name,
      recipient_url: payment.recipient_url,
      secret: payment.secret,
      tokens: payment.tokens,
      total_fiat_value: payment.total_fiat_value,
    });
  })
  .fail((r) => cbk([r.status, r.statusText]));

  return;
};

/** Present an error to the user

  {
    [err]: <Original Error Object>
    [show_add_channel]: <Display the Add Channel Button Bool> = false
    [show_add_peer]: <Display the Add Peer Button Bool> = false
    [title]: <Error Title Text String> = "Error"
    [text]: <Explanatory Text String> = "Unexpected error :( Try again?"
  }
*/
App.presentError = (args) => {
  if (!!args.err) {
    console.log('ERROR', args.err);
  }

  const title = args.title || 'Error';
  const text = args.text || 'Unexpected error :( Try again?';

  const errorCard = $('.wallet-error.template').clone();

  errorCard.removeClass('template').addClass('presented');
  errorCard.find('.title').text(title);
  errorCard.find('.text').text(text);

  if (!!args.show_add_peer) {
    errorCard.find('.add-peer').click(App.clickedAddPeer);
    errorCard.find('.add-peer').prop('hidden', false);
  }

  $('.transactions-break').after(errorCard);

  errorCard.hide();
  errorCard.show(App.animation_time_ms);
};

/** Present a received payment

  {
    fiat_value: <Fiat Value String>
    [id]: <Id String>
    [short_description]: <Received Payment Short Description String>
    tokens: <Received Tokens Number>
  }
*/
App.presentReceivedPayment = (args) => {
  if (!args.tokens) {
    return;
  }

  if (!!args.id) {
    if (!App.invoices[args.id]) {
      return;
    }

    App.invoices[args.id].card.remove();

    delete App.invoices[args.id];
  }

  setTimeout(() => App.refreshBalance({}), 2000);

  if (!!args.id && !!App.invoices[args.id] && App.invoices[args.id].card) {
    App.invoices[args.id].card.remove();
  }

  const amount = (args.tokens / 1e8).toFixed(8);
  const fiatAmount = args.fiat_value;
  const receivedPayment = $('.received-payment.template').clone();

  receivedPayment.removeClass('template').addClass('presented');
  receivedPayment.find('.amount').text(`${amount} tBTC ($${fiatAmount} tUSD)`);

  if (!!args.short_description) {
    receivedPayment.find('.short-description').text(args.short_description);
  }

  $('.transactions-break').after(receivedPayment);

  receivedPayment.hide();
  receivedPayment.show(App.animation_time_ms);

  if (!("Notification" in window)) {
    return;
  }

  const receiveNotification = new Notification(
    `Received ${amount} tBTC ($${fiatAmount} tUSD)`
  );

  setTimeout(
    receiveNotification.close.bind(receiveNotification),
    App.notification_show_ms
  );

  return;
};

/** Present updated directory card

  {}
*/
App.presentUpdatedDirectory = (args) => {
  window.scroll(0, 0);

  const card = $('.updated-directory.template').clone();

  card.removeClass('template').addClass('presented');

  $('.transactions-break').after(card);

  card.hide();
  card.show(App.animation_time_ms);

  return;
};

/** Present requested peer

  {
    address: <Peer Address String>
  }
*/
App.presentRequestedPeer = (args) => {
  const requestedPeer = $('.requested-peer-addition.template').clone();

  requestedPeer.removeClass('template').addClass('presented');

  requestedPeer.find('.peer').text(args.address);

  $('.transactions-break').after(requestedPeer);

  requestedPeer.hide();
  requestedPeer.show(App.animation_time_ms);

  return;
};

/** Present sent payment

  {
    description: <Payment Description String>
    fee: <Fee Tokens Number>
    fiat_value: <Fiat Value String>
    hops: [{
      channel_capacity: <Hop Channel Capacity Tokens Number>
      channel_id: <Hop Channel Id String>
      fee_mtokens: <Hop Forward Fee MilliTokens String>
      forward_mtokens: <Hop Forwarded MilliTokens String>
      timeout: <Hop CLTV Expiry Block Height Number>
    }]
    [secret]: <Payment Secret Preimage String>
    [recipient_name]: <Recipient Name String>
    [recipient_url]: <Recipient URL String>
    tokens: <Tokens Sent Number>
    total_fiat_value: <Total Fiat Value String>
  }
*/
App.presentSentPayment = (args) => {
  const hopLabel = args.hops.length - 1 > 1 ? 'Relays' : 'Relay';

  const amount = `Amount: ${(args.tokens / 1e8).toFixed(8)}`;
  const card = $('.sent-payment.template').clone();
  const feeAmount = ((args.fee || 0) / 1e8).toFixed(8);
  const fiatAmount = args.fiat_value;
  const hops = `${args.hops.length - 1} Lightning ${hopLabel}`;
  const totalAmount = ((args.fee + args.tokens) / 1e8).toFixed(8);
  const totalFiatAmount = args.total_fiat_value;

  const totalLabel = `Total: ${totalAmount} tBTC ($${totalFiatAmount} tUSD)`;

  card.removeClass('template').addClass('presented');
  card.find('.amount').text(`${amount} tBTC ($${fiatAmount} tUSD)`);
  card.find('.description').prop('hidden', !args.description);
  card.find('.description-text').text(args.description || '');
  card.find('.fee-amount').text(`Relay Fee: ${feeAmount} tBTC (${hops})`);
  card.find('.recipient').prop('hidden', !args.recipient_name);
  card.find('.recipient-link').prop('href', args.recipient_url);
  card.find('.recipient-link').text(args.recipient_name);
  card.find('.total-amount').text(totalLabel);

  if (!!args.secret) {
    card.find('.payment-secret').text(args.secret);
    card.find('.reveal-payment-proof').prop('hidden', false);

    card.find('.reveal-payment-proof').click(() => {
      card.find('.reveal-payment-proof').hide(App.animation_time_ms);

      card.find('.payment-proof').prop('hidden', false);
      card.find('.payment-proof').hide();
      card.find('.payment-proof').show(App.animation_time_ms);

      return;
    });
  }

  if (!args.fee) {
    card.find('.fee-amount').remove();
    card.find('.total-amount').remove();
  }

  $('.transactions-break').after(card);

  card.hide();
  card.show(App.animation_time_ms);

  return;
};

/** Wallet id
*/
App.recoverWallet = (args) => {
  const currentWalletId = App.wallet_id;

  App.getBalance({wallet_id: args.wallet_id}, (err) => {
    $('.recover-wallet').modal('hide');
    $('.start-recovery').text('Recover Wallet');

    if (currentWalletId !== App.wallet_id) {
      return;
    }

    $('.initializing').prop('hidden', true);

    if (!!err) {
      localStorage.wallet_id = '';

      $('.wallet-creation').prop('hidden', false);

      return App.presentError({
        err: err,
        text: 'Failed to recover wallet :( Try again?',
        title: ''
      });
    }

    localStorage.wallet_id = args.wallet_id;

    App.startWebSocket({});

    $('.payment-actions, .wallet-balance').hide();
    $('.payment-actions, .wallet-balance').show(App.animation_time_ms);
    $('.show-on-start').prop('hidden', false);
    $('.wallet-creation').hide(App.animation_time_ms);

    App.wallet_id = args.wallet_id;

    App.refreshBalance({});
  });
};

/** Refresh the visible balance

  {}
*/
App.refreshBalance = (args) => {
  // Exit early when already getting balance information
  if (!!App.is_getting_balance) {
    return;
  }

  const walletId = App.wallet_id;

  App.is_getting_balance = true;

  App.getBalance({wallet_id: App.wallet_id}, (err, res) => {
    App.is_getting_balance = false;

    // Wallet id changed during fetch
    if (walletId !== App.wallet_id) {
      return;
    }

    if (!!err) {
      return;
    }

    App.balance = res.balance;
    App.fiat_balance = res.fiat_balance;

    const balance = (res.balance / 1e8).toFixed(8);

    $('.wallet_balance').text(`${balance} tBTC ($${res.fiat_balance} tUSD)`);

    return;
  });
};

/** Refresh wallet information

  {
    ids: [<Invoice Id String>]
  }
*/
App.refreshInvoices = (args, cbk) => {
  if (!Array.isArray(args.ids)) {
    return cbk([0, 'Expected invoice ids']);
  }

  const ids = args.ids.filter((id) => !!App.invoices[id]);

  return async.eachSeries(ids, (id, cbk) => {
    if (!App.invoices[id] || App.invoices[id].status === 'checking') {
      return cbk();
    }

    App.invoices[id].status = 'checking';

    const card = App.invoices[id].card;

    if (!card) {
      return cbk();
    }

    card.find('.refresh-invoice i').addClass('fa-spin');

    return $.get(`https://htlc.me/v0/invoices/${App.wallet_id}/${id}`, (res) => {
      card.find('.refresh-invoice i').removeClass('fa-spin');

      App.invoices[id].status = null;

      const isConfirmed = res.is_confirmed;

      if (isConfirmed !== true && isConfirmed !== false) {
        return cbk([500, 'Expected confirmation status', res]);
      }

      // Exit early when not yet confirmed or already presented
      if (!isConfirmed) {
        return cbk();
      }

      App.presentReceivedPayment({
        id,
        fiat_value: res.fiat_value,
        tokens: res.tokens,
      });

      return cbk();
    })
    .fail((r) => {
      if (!!App.invoices[id]) {
        card.find('.refresh-invoice i').removeClass('fa-spin');

        App.invoices[id].status = 'errored';
      }

      return cbk([r.status, r.statusText]);
    })
  },
  (err) => {
    if (!!err) {
      return cbk(err);
    }

    return cbk();
  });
};

/** Base 64 encode

  {
    json: <JSON Object>
  }

  @return
  <Base 64 encoded string>
*/
App.safeBase64Encode = (args) => {
  if (!args.json) {
    return '';
  }

  const str = JSON.stringify(args.json);

  return btoa(
    encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
      (match, p1) => String.fromCharCode('0x' + p1)
    )
  );
};

/** Send a payment

  {
    request: <BOLT 11 Encoded Payment Request String>
    wallet_id: <Wallet Id String>
  }

  {
    description: <Payment Description String>
    fee: <Send Payment Fee Tokens Number>
    fiat_value: <Fiat Value String>
    hops: [{
      channel_capacity: <Hop Channel Capacity Tokens Number>
      channel_id: <Hop Channel Id String>
      fee_mtokens: <Hop Forward Fee MilliTokens String>
      forward_mtokens: <Hop Forwarded MilliTokens String>
      timeout: <Hop CLTV Expiry Block Height Number>
    }]
    [recipient_name]: <Recipient Name String>
    [recipient_url]: <Recipient URL String>
    secret: <Payment Secret Preimage String>
    tokens: <Payment Tokens Number>
    total_fiat_value: <TOtal Fiat Value String>
  }
*/
App.sendPayment = (args, cbk) => {
  $.post(`/v0/payments/${args.wallet_id}/${args.request}`)
  .done((payment) => {
    let description = payment.description || '';

    try {
      const jsonDescription = JSON.parse(payment.description);

      description = jsonDescription.d || jsonDescription.description || '';
    } catch (e) {}

    return cbk(null, {
      description,
      fee: payment.fee,
      fiat_value: payment.fiat_value,
      hops: payment.hops,
      recipient_name: payment.recipient_name,
      recipient_url: payment.recipient_url,
      secret: payment.secret,
      tokens: payment.tokens,
      total_fiat_value: payment.total_fiat_value,
    });
  })
  .fail((r) => cbk([r.status, r.statusText]));
};

/** Set node name

  {
    node_description: <Node Description String>
    node_name: <Node Name String>
    node_url: <Node Url String>
    signature: <Update Node Name Signature String>
  }
*/
App.setNodeDetails = (args, cbk) => {
  $.ajax({
    contentType: 'application/json',
    data: JSON.stringify({
      node_description: args.node_description,
      node_name: args.node_name,
      node_url: args.node_url,
      signature: args.signature,
    }),
    type: 'POST',
    url: `/v0/peers/details/`,
  })
  .done((res) => cbk())
  .fail((r) => cbk([r.status, r.statusText]))

  return;
};

/** Show directory boost

  {
    name: <Directory Node String>
    public_key: <Directory Node Public Key String>
  }
*/
App.showDirectoryBoost = (args) => {
  window.scroll(0, 0);

  const card = $('.boost-in-directory.template').clone();

  card.removeClass('template').addClass('presented');

  card.find('.cancel').click(() => card.hide(App.animation_time_ms));
  card.find('.node-to-boost-name').text(args.name);

  $('.transactions-break').after(card);

  card.find('.boost').click(() => {
    card.find('.boost').text('Boosting in directory...');

    $.post(`/v0/peers/${App.wallet_id}/directory_boost/${args.public_key}`)
    .done(() => {
      card.hide(App.animation_time_ms);

      App.refreshBalance({});

      App.showNetworkDirectory({});
      return;
    })
    .fail((r) => {
      App.presentError({
        err: [r.status, r.statusText],
        text: 'The node was not successfully boosted. Try again?',
        title: 'Failed to Boost',
      });
    })
    .always(() => {
      card.find('.boost').text('Pay 0.01 tBTC to boost');
      return;
    });
  });

  card.hide();
  card.show(App.animation_time_ms);
};

/** Show directory removal

  {
    name: <Directory Node String>
    public_key: <Directory Node Public Key String>
  }
*/
App.showDirectoryRemoval = (args) => {
  window.scroll(0, 0);

  const card = $('.remove-from-directory.template').clone();

  card.removeClass('template').addClass('presented');

  card.find('.cancel').click(() => card.hide(App.animation_time_ms));
  card.find('.node-to-remove-name').text(args.name);

  $('.transactions-break').after(card);

  card.find('.remove').click(() => {
    card.find('.remove').text('Removing from directory...');

    $.post(`/v0/peers/${App.wallet_id}/directory_removal/${args.public_key}`)
    .done(() => {
      card.hide(App.animation_time_ms);

      App.refreshBalance({});

      App.showNetworkDirectory({});
      return;
    })
    .fail((r) => {
      App.presentError({
        err: [r.status, r.statusText],
        text: 'The node was not successfully removed. Try again?',
        title: 'Failed to Remove',
      });
    })
    .always(() => {
      card.find('.remove').text('Pay 0.01 tBTC to remove');
      return;
    });
  });

  card.hide();
  card.show(App.animation_time_ms);
};

/** Show network directory

  {}
*/
App.showNetworkDirectory = (args) => {
  App.cancelPayment();

  $('.network-directory.presented, .network-graph.presented').remove();

  const card = $('.network-directory.template').clone();

  card.removeClass('template').addClass('presented');

  $('.transactions-break').after(card);

  card.find('.update-directory').click(App.clickedUpdateDirectory);
  card.find('.view-network-graph').click(App.clickedShowNetworkGraph);

  card.find('.copy').on('click', () => {
    card.find('.text-to-copy').select();

    document.execCommand('copy');

    card.find('.copy .text').text('Copied!');

    setTimeout(() => card.find('.copy .text').text('Copy'), 3000);

    return;
  });

  card.hide();
  card.show(App.animation_time_ms);

  card.find('.close').click(App.clickedCloseCard);

  App.getNetworkDirectory({}, (err, directory) => {
    if (!!err) {
      App.presentError({
        err: err,
        text: 'Could\'t get the network directory. Try again?',
        title: 'Network Directory',
      });

      return;
    }

    const node = directory.custodial_node;

    $('.custodial-address').val(`${node.public_key}@${node.ip}`);

    directory.nodes.forEach((n) => {
      const item = $('.presented .directory-item.template').clone();

      item.removeClass('template');

      item.find('.name').text(n.name);

      item.find('.boost').click(() => {
        App.showDirectoryBoost({name: n.name, public_key: n.public_key});

        return;
      });

      item.find('.remove').click(() => {
        App.showDirectoryRemoval({name: n.name, public_key: n.public_key});

        return;
      });

      if (!!n.url) {
        item.find('.name').prop('href', n.url);
      } else {
        item.find('.name').removeAttr('href');
        item.find('.name').addClass('text-dark');
        item.find('.name').removeClass('text-info');
      }

      item.find('.description').text(n.description);
      item.find('.public-key').text(n.public_key);

      card.find('.directory-list').append(item);

      item.hide();
      item.show(App.animation_time_ms);
    });
  });
};

/** Start the websocket connection

  {}
*/
App.startWebSocket = (args) => {
  App.ws = new WebSocket('wss://htlc.me');

  // Refresh wallet data when something happens
  App.ws.onmessage = (event) => {
    let message = {};

    try { message = JSON.parse(event.data); } catch (e) {}

    if (!!message && !!message.confirmed_id && !!message.tokens) {
      App.presentReceivedPayment({
        id: message.confirmed_id,
        fiat_value: message.fiat_value,
        tokens: message.tokens,
      });
    }

    return;
  };

  // Reopen websocket when closed
  App.ws.onclose = () => {
    return setTimeout(() => App.startWebSocket({}), App.ws_reconnect_time_ms);
  };

  return;
};

/** Submit add peer form
*/
App.submitAddPeerForm = function(e) {
  e.preventDefault();

  $('.presented.wallet-error').remove();

  const address = $(this).find('input').val();

  if (!address) {
    return;
  }

  const requestButton = $(this).find('.request');

  const initialButtonText = requestButton.text();

  requestButton.text('Requesting Peer Addition...');

  const card = $(this).closest('.card');

  App.addPeer({address}, (err) => {
    $(requestButton).text(initialButtonText);

    if (!!err) {
      App.presentError({
        err,
        text: 'Could not connect to peer :( Check that the address is correct?',
        title: 'Peer Connection Issue',
      });

      return;
    }

    card.remove();

    App.presentRequestedPeer({address});

    return;
  });
};

/** Submit wallet recovery form
*/
App.submitRecoveryForm = (e) => {
  e.preventDefault();

  $('.presented.wallet-error').remove();

  const walletId = $('.recover-wallet-id').val();

  if (!walletId) {
    return;
  }

  $('.start-recovery').text('Recovering Wallet...');

  App.recoverWallet({wallet_id: walletId});
};

/** Submit request payment form
*/
App.submitRequestPayment = (e) => {
  e.preventDefault();

  $('.presented.wallet-error').remove();

  const amount = $('.preparing-receive input').val();
  const swapsService = 'https://submarineswaps.org/';

  if (!amount || amount < App.minimum_tokens_number) {
    return;
  }

  const tokens = parseInt((parseFloat(amount) * 1e8).toFixed(), 10);

  $('.request-payment').prop('disabled', true);
  $('.request-payment').text('Creating Request...');

  // after clicking on 'Request Payment"
  return App.createInvoice({tokens}, (err, res) => {
    $('.request-payment').prop('disabled', false);
    $('.request-payment').text('Request Payment');

    if (!!err) {
      return App.presentError({
        err: err,
        title: 'Request Payment Error',
        text: `Couldn't create invoice :( Try again?`
      });
    }

    $('.preparing-receive input').val('');

    const card = $('.requested-payment.template').clone();
    const canNotify = !!window.Notification;

    const needsNotices = canNotify && Notification.permission !== 'granted';

    card.find('.enable-notifications').click(App.clickedEnableNotifications);
    card.find('.enable-notifications').prop('hidden', !needsNotices);

    const qr = kjua({
      back: 'rgb(250, 250, 250)',
      rounded: 100,
      size: 280,
      text: `lightning:${res.request}`,
    });

    card.find('.copy').on('click', () => {
      card.find('.text-to-copy').select();

      document.execCommand('copy');

      card.find('.copy .text').text('Copied!');

      setTimeout(() => card.find('.copy .text').text('Copy'), 3000);

      return;
    });

    card.find('.reveal-qr').on('click', () => {
      card.find('.reveal-qr').hide(App.animation_time_ms);
      card.find('.qr-code').prop('hidden', false);
      card.find('.qr-code').hide();
      card.find('.qr-code').show(App.animation_time_ms);
      return;
    });

    App.invoices[res.id] = {card};

    card.data('id', res.id);
    card.data('tokens', tokens);
    card.removeClass('template').addClass('presented');
    card.find('.payment-amount').prop('href', `lightning:${res.request}`);
    card.find('.payment-amount').text(`${amount} tBTC ($${res.fiat_value} tUSD)`);
    console.log(res.request)
    card.find('.payment-request').val(res.request);

    card.find('.qr-code').append($(qr));

    card.find('.refresh-invoice').click(() => {
      return App.refreshInvoices({ids: [res.id]}, () => {});
    });

    $('.transactions-break').after(card);

    $('.request-payment').addClass('collapse');

    card.hide();
    card.show(App.animation_time_ms);

    card.find('.on-chain')
      .prop('href', `${swapsService}?invoice=${res.request}&network=testnet`);

    return;
  });
};

/** Submit send payment form
*/
App.submitSendPayment = (e) => {
  e.preventDefault();

  const lightningRequest = $('.payment-preview').data().request;

  if (!!$('.payment-preview .send').prop('disabled')) {
    return;
  }

  $('.presented.wallet-error').remove();

  const paymentId = $('.payment-preview').data().payment_id;
  const tokens = $('.payment-preview').data().payment_tokens;

  if (!!App.sent_payments[paymentId]) {
    return App.presentError({
      text: 'You already paid that invoice! Ask them for a new one?',
      title: 'Payment Problem',
    });
  }

  if (App.balance < tokens) {
    return App.presentError({
      text: 'Your balance is not currently high enough to pay this invoice :(',
      title: 'Payment Problem',
    });
  }

  $('.preparing-send .request').prop('disabled', true);
  $('.payment-preview .cancel').prop('disabled', true);
  $('.payment-preview .send').prop('disabled', true);
  $('.payment-preview .send').text('Sending...');

  return App.sendPayment({
    request: $('.payment-preview').data().request,
    wallet_id: App.wallet_id,
  },
  (err, payment) => {
    $('.preparing-send .request').prop('disabled', false);
    $('.payment-preview .cancel').prop('disabled', false);
    $('.payment-preview .send').prop('disabled', false);
    $('.payment-preview .send').text('Send Payment');

    App.refreshBalance({});

    if (!!err) {
      const payment = $('.payment-preview').data() || {};

      if (!!payment.is_establishing || !!payment.has_direct_channel) {
        return App.presentError({
          err: err,
          title: 'Connection Error',
          text: 'HTLC.me is currently establishing network connectivity. ' +
            'Please try your send again later.',
        });
      }

      return App.presentError({
        err: err,
        show_add_peer: true,
        title: 'Send Payment Failed',
        text: 'Payment failed to send. This can happen due to temporary ' +
          'network connectivity issues or an unexpected server error.',
      });
    }

    App.sent_payments[paymentId] = true;

    App.refreshBalance({});
    
    $('.preparing-send .request').val('');
    App.changedRequestInput();

    return App.presentSentPayment({
      description: payment.description,
      fee: payment.fee,
      fiat_value: payment.fiat_value,
      hops: payment.hops,
      recipient_name: payment.recipient_name,
      recipient_url: payment.recipient_url,
      secret: payment.secret,
      tokens: payment.tokens,
      total_fiat_value: payment.total_fiat_value,
    });
  });
};

/** Switch to the network tab
*/
App.switchToNetworkTab = (args) => {
  $('.top-action .active').removeClass('active');
  $('.present-network .nav-link').addClass('active');
  $('.action-details').prop('hidden', true);
  $('.network-info').prop('hidden', false);

  window.scrollTo(0, 0);

  return;
};

/** Get a uuidv4
*/
App.uuid = (args) => {
  // return bitcore.PrivateKey()
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  );
};

/** Page loaded
*/
$(() => App.init({}));

/* global d3 */
function forceInABox(alpha) {
  function index(d) {
    return d.index;
  }

  const foci = {};
  let enableGrouping = true;
  let forceCharge = -2;
  let groupBy = (d) => d.cluster;
  var id = index;
  let links; //needed for the force version
  let linkStrengthInterCluster = 0.01;
  let linkStrengthIntraCluster = 0.1;
  let nodes;
  let nodeSize = 1; // Expected node size used for computing the cluster node
  const offset = [0,0];
  let size = [100,100];
  let strength = 0.1;
  let templateForce;
  let templateNodes = [];
  let templateNodesSel;
  let tree;
  let template = 'treemap';

  function force(alpha) {
    if (!enableGrouping) {
      return force;
    }

    if (template === 'force') {
      // Do the tick of the template force and get the new focis
      templateForce.tick();

      getFocisFromTemplate();
    }

    nodes.forEach((node) => {
      node.vx += (foci[groupBy(node)].x - node.x) * alpha * strength;
      node.vy += (foci[groupBy(node)].y - node.y) * alpha * strength;
    });
  }

  function initialize() {
    if (!nodes) {
      return;
    }

    if (template === "treemap") {
      initializeWithTreemap();
    } else {
      initializeWithForce();
    }
  }

  force.initialize = function(_) {
    nodes = _;

    initialize();
  };

  function getLinkKey(l) {
    const source = groupBy(l.source);
    const target = groupBy(l.target);

    return source <= target ? `${source}~${target}` : `${target}~${source}`;
  }

  function computeClustersNodeCounts(nodes) {
    let cluster = d3.map();

    nodes
    .filter((n) => !cluster.has(groupBy(n)))
    .forEach((n) => cluster.set(groupBy(n), 0));

    nodes
    .forEach((n) => cluster.set(groupBy(n), cluster.get(groupBy(n)) + 1));

    return cluster;
  }

  //Returns
  function computeClustersLinkCounts(links) {
    const dClusterLinks = d3.map();
    const clusterLinks = [];

    links.forEach((l) => {
      let count = 0;
      const key = getLinkKey(l)

      if (dClusterLinks.has(key)) {
        count = dClusterLinks.get(key);
      }

      count += 1;

      dClusterLinks.set(key, count);
    });

    dClusterLinks.entries().forEach((d) => {
      const [source, target] = d.key.split('~');

      clusterLinks.push({count: d.value, source: source, target: target});
    });

    return clusterLinks;
  }

  //Returns the metagraph of the clusters
  function getGroupsGraph() {
    let c;
    let clustersCounts;
    let clustersLinks;
    let clustersList;
    let dNodes = d3.map();
    let gnodes = [];
    let glinks = [];
    let i;
    let size;

    clustersCounts = computeClustersNodeCounts(nodes);
    clustersLinks = computeClustersLinkCounts(links);

    // map.keys() is really slow, it's crucial to have it outside the loop
    clustersList = clustersCounts.keys();

    clustersList.forEach((c, i) => {
      size = clustersCounts.get(c);

      gnodes.push({id: c, size: size});

      dNodes.set(c, i);
    });

    clustersLinks.forEach((l) => {
      return glinks.push({
        count: l.count,
        source: dNodes.get(l.source),
        target: dNodes.get(l.target),
      });
    });

    return {links: glinks, nodes: gnodes};
  }

  function getGroupsTree() {
    let c;
    let children = [];
    let clustersCounts;
    let clustersList;
    let i;
    let size;
    let totalSize = 0;

    clustersCounts = computeClustersNodeCounts(force.nodes());

    // map.keys() is really slow, it's crucial to have it outside the loop
    clustersList = clustersCounts.keys();

    clustersList.forEach((c) => {
      size = clustersCounts.get(c);
      children.push({id: c, size: size});
      totalSize += size;
    });

    return {children: children, id: 'clustersTree'};
  }

  function getFocisFromTemplate() {
    // compute foci
    foci.none = {x: 0, y: 0};

    templateNodes.forEach((d) => {
      if (template === 'treemap') {
        foci[d.data.id] = {
          x: (d.x0 + (d.x1 - d.x0) / 2) - offset[0],
          y: (d.y0 + (d.y1 - d.y0) / 2) - offset[1],
        };
      } else {
        foci[d.id] = {x: d.x - offset[0], y: d.y - offset[1]};
      }
    });
  }

  function initializeWithTreemap() {
    const treemap = d3.treemap().size(force.size());

    const tree = d3.hierarchy(getGroupsTree())
    .sum((d) => d.size)
    .sort((a, b) => b.height - a.height || b.value - a.value);

    templateNodes = treemap(tree).leaves();

    getFocisFromTemplate();
  }

  function checkLinksAsObjects() {
    // Check if links come in the format of indexes instead of objects
    let linkCount = 0;

    if (nodes.length === 0) {
      return;
    }

    links.forEach((link) => {
      let source;
      let target;

      if (!nodes) {
        return;
      }

      source = link.source;
      target = link.target;

      if (typeof link.source !== 'object') {
        source = nodes[link.source];
      }

      if (typeof link.target !== 'object') {
        target = nodes[link.target];
      }

      if (source === undefined || target === undefined) {
        throw Error(`Error setting links, couldn't find nodes for a link (see it on the console)`);
      }

      link.index = linkCount++;
      link.source = source;
      link.target = target;
    });
  }

  function initializeWithForce() {
    let net;

    if (nodes && nodes.length > 0 && groupBy(nodes[0]) === undefined) {
      throw Error(`Couldn't find the grouping attribute for the nodes. Make sure to set it up with forceInABox.groupBy('attr') before calling .links()`);
    }

    checkLinksAsObjects();

    net = getGroupsGraph();

    templateForce = d3.forceSimulation(net.nodes)
    .force('x', d3.forceX(size[0]/2).strength(0.5))
    .force('y', d3.forceY(size[1]/2).strength(0.5))
    .force('collide', d3.forceCollide((d) => d.size * nodeSize))
    .force('charge', d3.forceManyBody().strength((d) => forceCharge * d.size))
    .force('link', d3.forceLink(!net.nodes ? net.links : []))

    templateNodes = templateForce.nodes();

    getFocisFromTemplate();
  }

  function drawTreemap(container) {
    container.selectAll('.cell').remove();

    container.selectAll('cell')
    .data(templateNodes)
    .enter().append('svg:rect')
    .attr('class', 'cell')
    .attr('x', (d) => d.x0)
    .attr('y', (d) => d.y0)
    .attr('width', (d) => d.x1 - d.x0)
    .attr('height', (d) => d.y1 - d.y0)
  }

  function drawGraph(container) {
    container.selectAll('.cell').remove();

    templateNodesSel = container.selectAll('cell').data(templateNodes);

    templateNodesSel
    .enter().append('svg:circle')
    .attr('class', 'cell')
    .attr('cx', (d) => d.x)
    .attr('cy', (d) => d.y)
    .attr('r', (d) => d.size * nodeSize);
  }

  force.drawTemplate = function(container) {
    if (template === 'treemap') {
      drawTreemap(container);
    } else {
      drawGraph(container);
    }

    return force;
  };

  //Backwards compatibility
  force.drawTreemap = force.drawTemplate;

  force.deleteTemplate = function(container) {
    container.selectAll('.cell').remove();

    return force;
  };

  force.template = function(x) {
    if (!arguments.length) {
      return template;
    }

    template = x;

    initialize();

    return force;
  };

  force.groupBy = function(x) {
    if (!arguments.length) {
      return groupBy;
    }

    if (typeof x === 'string') {
      groupBy = function(d) { return d[x]; };

      return force;
    }

    groupBy = x;

    return force;
  };


  force.enableGrouping = function(x) {
    if (!arguments.length) {
      return enableGrouping;
    }

    enableGrouping = x;

    return force;
  };

  force.strength = function(x) {
    if (!arguments.length) {
      return strength;
    }

    strength = x;

    return force;
  };

  force.getLinkStrength = function(e) {
    if (enableGrouping) {
      if (groupBy(e.source) === groupBy(e.target)) {
        if (typeof(linkStrengthIntraCluster) === 'function') {
          return linkStrengthIntraCluster(e);
        } else {
          return linkStrengthIntraCluster;
        }
      } else {
        if (typeof(linkStrengthInterCluster) === 'function') {
          return linkStrengthInterCluster(e);
        } else {
          return linkStrengthInterCluster;
        }
      }
    } else {
      // Not grouping return the intracluster
      if (typeof(linkStrengthIntraCluster) === 'function') {
        return linkStrengthIntraCluster(e);
      } else {
        return linkStrengthIntraCluster;
      }
    }
  };

  force.id = function(_) {
    return arguments.length ? (id = _, force) : id;
  };

  force.size = function(_) {
    return arguments.length ? (size = _, force) : size;
  };

  force.linkStrengthInterCluster = function(_) {
    return arguments.length ? (linkStrengthInterCluster = _, force) : linkStrengthInterCluster;
  };

  force.linkStrengthIntraCluster = function(_) {
    return arguments.length ? (linkStrengthIntraCluster = _, force) : linkStrengthIntraCluster;
  };

  force.nodes = function(_) {
    return arguments.length ? (nodes = _, force) : nodes;
  };

  force.links = function(_) {
    if (!arguments.length) {
      return links;
    }

    if (_ === null) {
      links = [];
    } else {
      links = _;
    }

    return force;
  };

  force.nodeSize = function(_) {
    return arguments.length ? (nodeSize = _, force) : nodeSize;
  };

  force.forceCharge = function(_) {
    return arguments.length ? (forceCharge = _, force) : forceCharge;
  };

  force.offset = function(_) {
    return arguments.length ? (offset = _, force) : offset;
  };

  return force;
}

