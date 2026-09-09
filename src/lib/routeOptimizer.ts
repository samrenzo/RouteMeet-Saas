/**
 * Optimizes visit order for an open path: node 0 is the home base (fixed
 * start, never revisited), nodes 1..n are stops to sequence. Unlike a
 * classic TSP tour, there's no edge back to node 0 — the day just ends at
 * the last stop.
 *
 * matrix[i][j] = travel time (seconds) from node i to node j.
 * Returns the optimized order as stop indices (1-based positions into the
 * original stops array, i.e. 1 means stops[0]) — home base is never part
 * of the returned array.
 */
export function optimizeRoute(matrix: number[][]): number[] {
  const n = matrix.length; // includes home base at index 0
  if (n <= 2) return n === 2 ? [1] : [];

  const order = nearestNeighbor(matrix, n);
  return twoOpt(order, matrix);
}

function nearestNeighbor(matrix: number[][], n: number): number[] {
  const visited = new Set<number>([0]);
  const order: number[] = [];
  let current = 0;

  while (visited.size < n) {
    let nearest = -1;
    let nearestTime = Infinity;
    for (let candidate = 1; candidate < n; candidate++) {
      if (visited.has(candidate)) continue;
      const time = matrix[current][candidate];
      if (time < nearestTime) {
        nearestTime = time;
        nearest = candidate;
      }
    }
    if (nearest === -1) break; // remaining stops are unreachable (Infinity)
    visited.add(nearest);
    order.push(nearest);
    current = nearest;
  }

  return order;
}

/**
 * One full pass of 2-opt over the path [0, ...order]. Repeats until no
 * improving swap is found or a safety iteration cap is hit — cheap enough
 * for the small (<= ~20 stop) routes this product deals with.
 */
function twoOpt(order: number[], matrix: number[][]): number[] {
  const path = [0, ...order];
  let improved = true;
  let iterations = 0;
  const maxIterations = 200;

  const pathLength = (p: number[]) => {
    let total = 0;
    for (let i = 0; i < p.length - 1; i++) total += matrix[p[i]][p[i + 1]];
    return total;
  };

  while (improved && iterations < maxIterations) {
    improved = false;
    iterations++;

    for (let i = 1; i < path.length - 1; i++) {
      for (let j = i + 1; j < path.length; j++) {
        const reversed = [
          ...path.slice(0, i),
          ...path.slice(i, j + 1).reverse(),
          ...path.slice(j + 1),
        ];

        if (pathLength(reversed) < pathLength(path) - 0.001) {
          path.splice(0, path.length, ...reversed);
          improved = true;
        }
      }
    }
  }

  return path.slice(1);
}
