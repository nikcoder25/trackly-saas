<?php
/**
 * Lvx_Publish — decisions the publish path makes before it writes.
 *
 * Kept free of WordPress globals so they can be tested directly, in the same
 * spirit as Lvx_Patch.
 */

if (!defined('ABSPATH')) { exit; }

class Lvx_Publish {

    /**
     * Should the pre-publish snapshot be (re)taken?
     *
     * The snapshot is what "Undo this change" restores, and it is taken
     * immediately before writing — so on a *retry* of a publish that already
     * wrote, re-snapshotting captures the already-modified page and destroys
     * the only copy of the original. Retries are routine here: an instruction
     * is re-sent whenever its ack does not reach Livesov, which includes the
     * case where the publish itself died partway through.
     *
     * So an existing snapshot taken for this same instruction is kept. A
     * snapshot from a different instruction is stale — that change is already
     * live and is what the user would want back — so it is replaced.
     *
     * A publish with no instruction id (a manual re-publish) always snapshots:
     * there is no id to match on, and the current state is by definition what
     * the user is about to change away from.
     *
     * @param mixed  $existing       Stored backup record, or anything falsy.
     * @param string $instruction_id Instruction being applied ('' if none).
     */
    public static function should_snapshot($existing, $instruction_id) {
        if (!is_array($existing) || empty($existing['state'])) { return true; }
        if ((string) $instruction_id === '') { return true; }
        $for = isset($existing['fix']) ? (string) $existing['fix'] : '';
        return $for !== (string) $instruction_id;
    }
}
