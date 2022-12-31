import { useState, useEffect, useRef } from 'react';
import { formatDistance } from 'date-fns';

export const TimeAgo = ({ timestamp }) => {
  const intervalRef = useRef();
  const [distance, setDistance] = useState('-');

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    const updateDistance = () =>
      setDistance(formatDistance(timestamp, Date.now()));

    // set interval
    intervalRef.current = setInterval(updateDistance, 30_000);
    // update the distance
    updateDistance();

    return () => clearInterval(intervalRef.current);
  }, [timestamp]);

  return distance;
};
