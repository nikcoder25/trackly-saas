<?php
/**
 * Lvx_Publish::should_snapshot — protecting the undo snapshot across retries.
 *
 * The snapshot is taken immediately before the publish writes, so re-taking it
 * on a retry captures the already-published page and loses the original for
 * good. Retries are routine: any publish whose ack does not reach Livesov is
 * re-sent on the next 5-minute poll.
 */

T::group('publish/snapshot');

$snapshot = array('builder' => 'gutenberg', 'state' => array('post_content' => '<p>original</p>'), 'fix' => 'fix-1');

T::ok(Lvx_Publish::should_snapshot(null, 'fix-1'), 'no snapshot yet → take one');
T::ok(Lvx_Publish::should_snapshot(array(), 'fix-1'), 'empty record → take one');
T::ok(Lvx_Publish::should_snapshot(array('state' => array()), 'fix-1'), 'record with no state → take one');

T::ok(
    !Lvx_Publish::should_snapshot($snapshot, 'fix-1'),
    'retry of the SAME instruction keeps the original snapshot'
);

T::ok(
    Lvx_Publish::should_snapshot($snapshot, 'fix-2'),
    'a different instruction re-snapshots — the previous fix is already live'
);

T::ok(
    Lvx_Publish::should_snapshot($snapshot, ''),
    'manual publish with no instruction id snapshots the current state'
);

// A snapshot written before this fix existed carries no id; it belongs to some
// earlier change that is already live, so it is safe to replace.
T::ok(
    Lvx_Publish::should_snapshot(array('state' => array('post_content' => 'x')), 'fix-9'),
    'legacy snapshot without an id is replaced'
);

// Ids are compared as strings so a numeric id does not match loosely.
T::ok(
    !Lvx_Publish::should_snapshot(array('state' => array('x' => 1), 'fix' => '12'), 12),
    'numeric instruction id matches its string form'
);
T::ok(
    Lvx_Publish::should_snapshot(array('state' => array('x' => 1), 'fix' => '12'), '12a'),
    'similar-but-different ids do not match'
);
