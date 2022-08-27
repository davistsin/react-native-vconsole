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
   * 订阅事件
   * @param topic 主题
   * @param listener 监听
   * @returns 是否拦截事件传递，返回true，则后续的订阅都接收不到
   */
  public static on<T>(
    topic: string,
    listener: (event: T) => boolean | Promise<boolean>
  ): Bus | undefined {
    if (!EventBus.topicMap.has(topic)) {
      EventBus.topicMap.set(topic, { callBackSet: new Set<CallBack>() });
    }
    const bus = EventBus.topicMap.get(topic);
    if (bus) {
      bus.callBackSet.add(listener);
      return {
        remove: () => {
          const b = EventBus.topicMap.get(topic);
          b && b.callBackSet.delete(listener);
        },
      };
    }
    return undefined;
  }

  /**
   * 发布事件
   * @param topic 主题
   * @param event 事件
   */
  public static async emit(topic: string, event: any) {
    const bus = EventBus.topicMap.get(topic);
    if (bus) {
      for (let callback of bus.callBackSet) {
        const interceptor = await callback(event);
        if (interceptor) {
          return true;
        }
      }
      return true;
    }
    return false;
  }

  /**
   * 移除该主题下的所有监听，会将其topic对应下的所有listener都清掉
   * @param topic 主题
   */
  public static off(topic: string) {
    return EventBus.topicMap.delete(topic);
  }
}
