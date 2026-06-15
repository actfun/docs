import { Address, BigInt, DataSourceContext } from "@graphprotocol/graph-ts";
import {
  ActedFun,
  TokenGraduated,
  ArcRefundClaimed,
  TokenLauncher,
} from "../generated/templates/TokenLauncher/TokenLauncher";
import { UnitFlowV3Pool } from "../generated/templates";
import { Token, Mine, Graduation, RefundClaim } from "../generated/schema";

export function handleActedFun(event: ActedFun): void {
  let tokenId = event.address;
  let mine = new Mine(event.transaction.hash.concatI32(event.logIndex.toI32()));
  mine.token = tokenId;
  mine.user = event.params.user;
  mine.funnyPost = event.params.funnyPost;
  mine.amount = event.params.amount;
  mine.timestamp = event.params.timestamp;
  mine.block = event.block.number;
  mine.txHash = event.transaction.hash;
  mine.save();

  let token = Token.load(tokenId);
  if (token != null) {
    token.mineCount = token.mineCount.plus(BigInt.fromI32(1));
    token.totalMined = token.totalMined.plus(event.params.amount);
    token.save();
  }
}

export function handleTokenGraduated(event: TokenGraduated): void {
  let tokenId = event.address;
  let grad = new Graduation(
    event.transaction.hash.concatI32(event.logIndex.toI32()),
  );
  grad.token = tokenId;
  grad.tokenSeeded = event.params.tokenSeeded;
  grad.arcSeeded = event.params.arcSeeded;
  grad.timestamp = event.params.timestamp;
  grad.block = event.block.number;
  grad.txHash = event.transaction.hash;
  grad.save();

  let token = Token.load(tokenId);

  // Resolve the dynamically-created V3 pool and start indexing its swaps.
  // The pool template is spawned independently of the Token load so swaps are
  // always indexed even in the unlikely case the Token entity is missing (e.g.
  // a future redeploy with a start block after some TokenCreated events).
  let launcher = TokenLauncher.bind(event.address);
  let poolCall = launcher.try_poolAddress();
  if (!poolCall.reverted && poolCall.value != Address.zero()) {
    let ctx = new DataSourceContext();
    ctx.setBytes("token", tokenId);
    UnitFlowV3Pool.createWithContext(poolCall.value, ctx);
    if (token != null) {
      token.poolAddress = poolCall.value;
    }
  }

  if (token != null) {
    token.graduated = true;
    token.graduatedTimestamp = event.params.timestamp;
    token.tokenSeeded = event.params.tokenSeeded;
    token.arcSeeded = event.params.arcSeeded;
    token.save();
  }
}

export function handleArcRefundClaimed(event: ArcRefundClaimed): void {
  let refund = new RefundClaim(
    event.transaction.hash.concatI32(event.logIndex.toI32()),
  );
  refund.token = event.address;
  refund.user = event.params.user;
  refund.amount = event.params.amount;
  refund.timestamp = event.params.timestamp;
  refund.block = event.block.number;
  refund.txHash = event.transaction.hash;
  refund.save();
}
