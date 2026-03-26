import React, { useCallback } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Star } from 'lucide-react-native';
import Colors from '@/constants/colors';

interface RatingStarsProps {
  rating: number;
  size?: number;
  interactive?: boolean;
  onRatingChange?: (rating: number) => void;
}

export default React.memo(function RatingStars({ rating, size = 20, interactive, onRatingChange }: RatingStarsProps) {
  const renderStar = useCallback((index: number) => {
    const filled = index < rating;
    const starElement = (
      <Star
        key={index}
        size={size}
        color={Colors.gold}
        fill={filled ? Colors.gold : 'transparent'}
      />
    );

    if (interactive && onRatingChange) {
      return (
        <Pressable key={index} onPress={() => onRatingChange(index + 1)} hitSlop={8}>
          {starElement}
        </Pressable>
      );
    }

    return starElement;
  }, [rating, size, interactive, onRatingChange]);

  return (
    <View style={styles.container}>
      {[0, 1, 2, 3, 4].map(renderStar)}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 4,
  },
});
