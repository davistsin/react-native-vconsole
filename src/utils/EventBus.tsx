type CallBack = (event: any) => boolean | Promise<boolean>;

interface BusSet {
  callBackSet: Set<CallBack>;
}

export interface Bus {
  remove: () => void;
}

export default class EventBus {
  private static topicMap = new Map<string, BusSet>();

  /**
   * Subscribe topic. Don't forget call remove().
   * @param topic Event topic
   * @param listener
   * @returns boolean Whether to intercept event delivery, if it returns true, subsequent subscriptions will not receive it
   */
  public static on<T>(
    topic: string,
    listener: (event: T) => boolean | Promise<boolean>
  ): Bus {
    if (!EventBus.topicMap.has(topic)) {
      EventBus.topicMap.set(topic, { callBackSet: new Set<CallBack>() });
    }
    const bus = EventBus.topicMap.get(topic);
    bus!.callBackSet.add(listener);
    return {
      remove: () => {
        const b = EventBus.topicMap.get(topic);
        b && b.callBackSet.delete(listener);
      },
    };
  }

  /**
   * Emit event by topic
   * @param topic string
   * @param event any object
   */
  public static async emit(topic: string, event: any) {
    const bus = EventBus.topicMap.get(topic);
    if (bus) {
      for (let callback of bus.callBackSet) {
        try {
          const interceptor = await callback(event);
          if (interceptor) {
            return true;
          }
        } catch (e) {}
      }
      return true;
    }
    return false;
  }

  /**
   * Removing all listeners under the topic.
   * @param topic string
   */
  public static off(topic: string) {
    return EventBus.topicMap.delete(topic);
  }
}
