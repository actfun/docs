import { dataSource } from "@graphprotocol/graph-ts";
import { Swap as SwapEvent } from "../generated/templates/UnitFlowV3Pool/UnitFlowV3Pool";
import { Swap } from "../generated/schema";

export function handleSwap(event: SwapEvent): void {
  let ctx = dataSource.context();
  let swap = new Swap(event.transaction.hash.concatI32(event.logIndex.toI32()));
  swap.pool = event.address;
  swap.token = ctx.getBytes("token");
  swap.sender = event.params.sender;
  swap.recipient = event.params.recipient;
  swap.amount0 = event.params.amount0;
  swap.amount1 = event.params.amount1;
  swap.sqrtPriceX96 = event.params.sqrtPriceX96;
  swap.liquidity = event.params.liquidity;
  swap.tick = event.params.tick;
  swap.timestamp = event.block.timestamp;
  swap.block = event.block.number;
  swap.txHash = event.transaction.hash;
  swap.save();
}
